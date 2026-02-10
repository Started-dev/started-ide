import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function stripeFetch(path: string, token: string, options: RequestInit = {}) {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Stripe API ${resp.status}`);
  return data;
}

function formEncode(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(formEncode(value as Record<string, unknown>, fullKey));
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { tool, input, stripe_token } = await req.json();
    if (!tool || !stripe_token) {
      return json({ error: "missing 'tool' or 'stripe_token'" }, 400);
    }

    let result: unknown;

    switch (tool) {
      // ─── Customers ───
      case "stripe_list_customers": {
        const limit = input?.limit || 10;
        result = await stripeFetch(`/customers?limit=${limit}`, stripe_token);
        break;
      }
      case "stripe_get_customer": {
        const { customer_id } = input || {};
        if (!customer_id) return json({ error: "customer_id required" }, 400);
        result = await stripeFetch(`/customers/${customer_id}`, stripe_token);
        break;
      }
      case "stripe_create_customer": {
        const { email, name, description, metadata } = input || {};
        const params: Record<string, unknown> = {};
        if (email) params.email = email;
        if (name) params.name = name;
        if (description) params.description = description;
        if (metadata) params.metadata = metadata;
        result = await stripeFetch("/customers", stripe_token, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formEncode(params),
        });
        break;
      }

      // ─── Products ───
      case "stripe_list_products": {
        const limit = input?.limit || 10;
        result = await stripeFetch(`/products?limit=${limit}`, stripe_token);
        break;
      }
      case "stripe_create_product": {
        const { name, description, metadata } = input || {};
        if (!name) return json({ error: "name required" }, 400);
        const params: Record<string, unknown> = { name };
        if (description) params.description = description;
        if (metadata) params.metadata = metadata;
        result = await stripeFetch("/products", stripe_token, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formEncode(params),
        });
        break;
      }

      // ─── Prices ───
      case "stripe_list_prices": {
        const limit = input?.limit || 10;
        const product = input?.product ? `&product=${input.product}` : "";
        result = await stripeFetch(`/prices?limit=${limit}${product}`, stripe_token);
        break;
      }
      case "stripe_create_price": {
        const { unit_amount, currency, product, recurring } = input || {};
        if (!unit_amount || !currency || !product) return json({ error: "unit_amount, currency, product required" }, 400);
        const params: Record<string, unknown> = { unit_amount, currency, product };
        if (recurring) params.recurring = recurring;
        result = await stripeFetch("/prices", stripe_token, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formEncode(params),
        });
        break;
      }

      // ─── Subscriptions ───
      case "stripe_list_subscriptions": {
        const limit = input?.limit || 10;
        const customer = input?.customer ? `&customer=${input.customer}` : "";
        result = await stripeFetch(`/subscriptions?limit=${limit}${customer}`, stripe_token);
        break;
      }
      case "stripe_get_subscription": {
        const { subscription_id } = input || {};
        if (!subscription_id) return json({ error: "subscription_id required" }, 400);
        result = await stripeFetch(`/subscriptions/${subscription_id}`, stripe_token);
        break;
      }
      case "stripe_cancel_subscription": {
        const { subscription_id } = input || {};
        if (!subscription_id) return json({ error: "subscription_id required" }, 400);
        result = await stripeFetch(`/subscriptions/${subscription_id}`, stripe_token, { method: "DELETE" });
        break;
      }

      // ─── Payment Intents ───
      case "stripe_list_payment_intents": {
        const limit = input?.limit || 10;
        result = await stripeFetch(`/payment_intents?limit=${limit}`, stripe_token);
        break;
      }
      case "stripe_get_balance": {
        result = await stripeFetch("/balance", stripe_token);
        break;
      }

      // ─── Invoices ───
      case "stripe_list_invoices": {
        const limit = input?.limit || 10;
        const customer = input?.customer ? `&customer=${input.customer}` : "";
        result = await stripeFetch(`/invoices?limit=${limit}${customer}`, stripe_token);
        break;
      }

      default:
        return json({ error: `Unknown tool: ${tool}` }, 400);
    }

    return json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Plan key → Stripe price IDs (must be set as secrets — no placeholders)
const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  builder: Deno.env.get("STRIPE_PRICE_BUILDER"),
  pro: Deno.env.get("STRIPE_PRICE_PRO"),
  studio: Deno.env.get("STRIPE_PRICE_STUDIO"),
};

async function stripeFetch(path: string, body?: string) {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body } : {}),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Stripe ${resp.status}`);
  return data;
}

async function findOrCreateCustomer(userId: string, email: string): Promise<string> {
  const searchResp = await fetch(
    `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(`metadata["user_id"]:"${userId}"`)}`,
    { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
  );
  const searchData = await searchResp.json();
  if (searchData.data && searchData.data.length > 0) {
    return searchData.data[0].id;
  }
  const params = new URLSearchParams({ email, "metadata[user_id]": userId });
  const customer = await stripeFetch("/customers", params.toString());
  return customer.id;
}

// ─── Webhook signature verification ───
async function verifyWebhookSignature(payload: string, sigHeader: string): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET) return false;
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [key, val] = part.split("=");
    if (key === "t") acc.timestamp = val;
    if (key === "v1") acc.signatures.push(val);
    return acc;
  }, { timestamp: "", signatures: [] as string[] });

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  const signedPayload = `${parts.timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return parts.signatures.includes(expectedSig);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) {
      return json({ error: "Stripe is not configured yet. Please add your STRIPE_SECRET_KEY." }, 503);
    }

    // ─── Webhook (separate path — no auth required) ───
    const url = new URL(req.url);
    if (url.pathname.endsWith("/webhook") || url.searchParams.get("action") === "webhook") {
      const rawBody = await req.text();
      const sigHeader = req.headers.get("stripe-signature") || "";

      if (STRIPE_WEBHOOK_SECRET) {
        const valid = await verifyWebhookSignature(rawBody, sigHeader);
        if (!valid) return json({ error: "Invalid webhook signature" }, 400);
      }

      const event = JSON.parse(rawBody);
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const planKey = session.metadata?.plan_key;

        if (userId && planKey) {
          const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE);
          const { data: existing } = await adminSupabase
            .from("api_usage_ledger")
            .select("id")
            .eq("owner_id", userId)
            .order("period_start", { ascending: false })
            .limit(1);

          if (existing && existing.length > 0) {
            await adminSupabase
              .from("api_usage_ledger")
              .update({ plan_key: planKey })
              .eq("id", existing[0].id);
          }
        }
      }
      return json({ received: true });
    }

    // ─── Authenticated actions ───
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json();
    const { action, plan_key, session_id } = body;
    const origin = req.headers.get("origin") || "https://localhost:5173";

    // ─── Create Checkout Session ───
    if (action === "create_checkout") {
      const priceId = PLAN_PRICE_MAP[plan_key];
      if (!priceId) return json({ error: `Price not configured for plan: ${plan_key}. Set STRIPE_PRICE_${plan_key.toUpperCase()} secret.` }, 400);

      const customerId = await findOrCreateCustomer(user.id, user.email || "");

      const params = new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/settings?checkout=success&plan=${plan_key}`,
        cancel_url: `${origin}/settings?checkout=cancelled`,
        customer: customerId,
        "subscription_data[metadata][plan_key]": plan_key,
        "subscription_data[metadata][user_id]": user.id,
        "metadata[plan_key]": plan_key,
        "metadata[user_id]": user.id,
        allow_promotion_codes: "true",
      });

      const session = await stripeFetch("/checkout/sessions", params.toString());
      return json({ url: session.url });
    }

    // ─── Customer Portal ───
    if (action === "create_portal") {
      const customerId = await findOrCreateCustomer(user.id, user.email || "");
      const params = new URLSearchParams({
        customer: customerId,
        return_url: `${origin}/settings`,
      });
      const portalSession = await stripeFetch("/billing_portal/sessions", params.toString());
      return json({ url: portalSession.url });
    }

    // ─── Verify Checkout ───
    if (action === "verify_checkout") {
      if (!session_id) return json({ error: "session_id required" }, 400);

      const session = await stripeFetch(`/checkout/sessions/${session_id}`);
      if (session.payment_status !== "paid") {
        return json({ error: "Payment not completed" }, 400);
      }

      const planKey = session.metadata?.plan_key;
      if (!planKey) return json({ error: "Missing plan metadata" }, 400);

      const now = new Date();
      const periodStart = now.toISOString().slice(0, 10);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
        .toISOString().slice(0, 10);

      const { data: existing } = await supabase
        .from("api_usage_ledger")
        .select("id")
        .eq("owner_id", user.id)
        .order("period_start", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("api_usage_ledger")
          .update({ plan_key: planKey })
          .eq("id", existing[0].id);
      } else {
        await supabase.from("api_usage_ledger").insert({
          owner_id: user.id,
          plan_key: planKey,
          period_start: periodStart,
          period_end: periodEnd,
        });
      }

      return json({ ok: true, plan_key: planKey });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});

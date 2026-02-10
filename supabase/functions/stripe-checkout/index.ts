import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Plan key → Stripe price lookup
// You should create these products/prices in your Stripe dashboard
// and paste the price IDs here.
const PLAN_PRICE_MAP: Record<string, string> = {
  builder: Deno.env.get("STRIPE_PRICE_BUILDER") || "price_builder_placeholder",
  pro: Deno.env.get("STRIPE_PRICE_PRO") || "price_pro_placeholder",
  studio: Deno.env.get("STRIPE_PRICE_STUDIO") || "price_studio_placeholder",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) {
      return json({ error: "Stripe is not configured yet. Please add your STRIPE_SECRET_KEY." }, 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { action, plan_key, session_id } = await req.json();

    // ─── Create Checkout Session ───
    if (action === "create_checkout") {
      const priceId = PLAN_PRICE_MAP[plan_key];
      if (!priceId) return json({ error: `Unknown plan: ${plan_key}` }, 400);

      const origin = req.headers.get("origin") || "https://localhost:5173";

      const params = new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/settings?checkout=success&plan=${plan_key}`,
        cancel_url: `${origin}/settings?checkout=cancelled`,
        client_reference_id: user.id,
        customer_email: user.email || "",
        "metadata[plan_key]": plan_key,
        "metadata[user_id]": user.id,
      });

      const session = await stripeFetch("/checkout/sessions", params.toString());
      return json({ url: session.url });
    }

    // ─── Verify Checkout & Update Plan ───
    if (action === "verify_checkout") {
      if (!session_id) return json({ error: "session_id required" }, 400);

      const session = await stripeFetch(`/checkout/sessions/${session_id}`);
      if (session.payment_status !== "paid") {
        return json({ error: "Payment not completed" }, 400);
      }

      const planKey = session.metadata?.plan_key;
      if (!planKey) return json({ error: "Missing plan metadata" }, 400);

      // Update or create usage ledger with new plan
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

    // ─── Webhook (for async payment confirmation) ───
    if (action === "webhook") {
      // In production, verify the Stripe signature here
      const event = await req.json();
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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});

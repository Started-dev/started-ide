import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate via shared webhook secret
    const webhookSecret = Deno.env.get("OPENCLAW_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret");

    if (!webhookSecret || providedSecret !== webhookSecret) {
      return json({ error: "Invalid or missing webhook secret" }, 401);
    }

    const body = await req.json();
    const {
      project_id,
      event_type,
      payload,
    } = body;

    if (!project_id || !event_type) {
      return json({ error: "project_id and event_type are required" }, 400);
    }

    // Validate event_type
    const validEvents = [
      "task.completed",
      "task.failed",
      "task.started",
      "task.progress",
      "message.received",
      "skill.installed",
      "skill.uninstalled",
      "memory.added",
      "error",
    ];
    if (!validEvents.includes(event_type)) {
      return json({ error: `Invalid event_type. Valid: ${validEvents.join(", ")}` }, 400);
    }

    // Insert into openclaw_events — triggers realtime broadcast
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error: insertErr } = await supabase
      .from("openclaw_events")
      .insert({
        project_id,
        event_type,
        payload: payload || {},
      });

    if (insertErr) {
      return json({ error: insertErr.message }, 500);
    }

    return json({ ok: true, event_type });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    project_id: string;
    event: string;
    payload?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { project_id, event, payload = {} } = body;

  if (!project_id || !event) {
    return new Response(
      JSON.stringify({ error: "Missing project_id or event" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Validate supported events
  const supportedEvents = ["OnDeploy", "OnFileChange", "OnError"];
  if (!supportedEvents.includes(event)) {
    return new Response(
      JSON.stringify({ error: `Unsupported event: ${event}. Supported: ${supportedEvents.join(", ")}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Find matching hooks
  const { data: hooks } = await supabase
    .from("project_hooks")
    .select("*")
    .eq("project_id", project_id)
    .eq("event", event)
    .eq("enabled", true);

  if (!hooks || hooks.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, hooks_triggered: 0, message: "No matching hooks" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let triggered = 0;
  const results: Array<{ hook_id: string; status: string; duration_ms: number }> = [];

  for (const hook of hooks) {
    const startTime = Date.now();
    let status = "success";
    let outputPayload: Record<string, unknown> = {};

    try {
      if (hook.action === "webhook" && hook.webhook_url) {
        // Forward to external URL
        const resp = await fetch(hook.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hook_id: hook.id,
            event,
            project_id,
            payload: {
              ...payload,
              triggered_by: user.email || user.id,
              triggered_at: new Date().toISOString(),
            },
          }),
        });
        outputPayload = { status: resp.status, statusText: resp.statusText };
        if (!resp.ok) status = "failed";
      } else if (hook.action === "log") {
        outputPayload = { logged: true, event, label: hook.label };
      } else if (hook.action === "notify") {
        outputPayload = { notified: true, label: hook.label, event };
      }

      triggered++;
    } catch (err) {
      status = "failed";
      outputPayload = {
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }

    const durationMs = Date.now() - startTime;

    // Log execution
    await supabase.from("hook_execution_log").insert({
      hook_id: hook.id,
      project_id,
      event,
      input_payload: payload,
      output_payload: outputPayload,
      status,
      duration_ms: durationMs,
    });

    results.push({ hook_id: hook.id, status, duration_ms: durationMs });
  }

  return new Response(
    JSON.stringify({ ok: true, hooks_triggered: triggered, results }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

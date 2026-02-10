import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.digitalocean.com/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, do_token } = await req.json();
    if (!do_token) return new Response(JSON.stringify({ ok: false, error: "do_token required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${do_token}`, "Content-Type": "application/json" };
    let result: unknown;

    switch (tool) {
      case "do_account": {
        const r = await fetch(`${BASE}/account`, { headers });
        result = await r.json();
        break;
      }
      case "do_list_droplets": {
        const r = await fetch(`${BASE}/droplets?per_page=${input.per_page || 25}`, { headers });
        result = await r.json();
        break;
      }
      case "do_get_droplet": {
        const r = await fetch(`${BASE}/droplets/${input.droplet_id}`, { headers });
        result = await r.json();
        break;
      }
      case "do_droplet_action": {
        const r = await fetch(`${BASE}/droplets/${input.droplet_id}/actions`, { method: "POST", headers, body: JSON.stringify({ type: input.action_type }) });
        result = await r.json();
        break;
      }
      case "do_list_databases": {
        const r = await fetch(`${BASE}/databases`, { headers });
        result = await r.json();
        break;
      }
      case "do_list_domains": {
        const r = await fetch(`${BASE}/domains`, { headers });
        result = await r.json();
        break;
      }
      case "do_list_apps": {
        const r = await fetch(`${BASE}/apps`, { headers });
        result = await r.json();
        break;
      }
      case "do_list_volumes": {
        const r = await fetch(`${BASE}/volumes`, { headers });
        result = await r.json();
        break;
      }
      default:
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

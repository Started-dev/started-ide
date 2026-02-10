import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, docker_host, docker_api_key } = await req.json();
    const host = docker_host || "http://localhost:2375";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (docker_api_key) headers["Authorization"] = `Bearer ${docker_api_key}`;

    let result: unknown;

    switch (tool) {
      case "docker_list_containers": {
        const r = await fetch(`${host}/v1.43/containers/json?all=${input.all || false}`, { headers });
        result = await r.json();
        break;
      }
      case "docker_inspect_container": {
        const r = await fetch(`${host}/v1.43/containers/${input.container_id}/json`, { headers });
        result = await r.json();
        break;
      }
      case "docker_start_container": {
        const r = await fetch(`${host}/v1.43/containers/${input.container_id}/start`, { method: "POST", headers });
        result = { status: r.status, ok: r.ok };
        break;
      }
      case "docker_stop_container": {
        const r = await fetch(`${host}/v1.43/containers/${input.container_id}/stop`, { method: "POST", headers });
        result = { status: r.status, ok: r.ok };
        break;
      }
      case "docker_list_images": {
        const r = await fetch(`${host}/v1.43/images/json`, { headers });
        result = await r.json();
        break;
      }
      case "docker_list_networks": {
        const r = await fetch(`${host}/v1.43/networks`, { headers });
        result = await r.json();
        break;
      }
      case "docker_list_volumes": {
        const r = await fetch(`${host}/v1.43/volumes`, { headers });
        result = await r.json();
        break;
      }
      case "docker_system_info": {
        const r = await fetch(`${host}/v1.43/info`, { headers });
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

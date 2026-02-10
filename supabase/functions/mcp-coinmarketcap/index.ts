import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://pro-api.coinmarketcap.com/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, cmc_api_key } = await req.json();
    if (!cmc_api_key) return new Response(JSON.stringify({ ok: false, error: "cmc_api_key required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { "X-CMC_PRO_API_KEY": cmc_api_key, Accept: "application/json" };
    let result: unknown;

    switch (tool) {
      case "cmc_listings": {
        const r = await fetch(`${BASE}/cryptocurrency/listings/latest?limit=${input.limit || 25}&convert=${input.convert || "USD"}`, { headers });
        result = await r.json();
        break;
      }
      case "cmc_quotes": {
        const r = await fetch(`${BASE}/cryptocurrency/quotes/latest?${input.id ? `id=${input.id}` : `symbol=${input.symbol}`}&convert=${input.convert || "USD"}`, { headers });
        result = await r.json();
        break;
      }
      case "cmc_info": {
        const r = await fetch(`${BASE}/cryptocurrency/info?${input.id ? `id=${input.id}` : `symbol=${input.symbol}`}`, { headers });
        result = await r.json();
        break;
      }
      case "cmc_map": {
        const r = await fetch(`${BASE}/cryptocurrency/map?limit=${input.limit || 100}`, { headers });
        result = await r.json();
        break;
      }
      case "cmc_global_metrics": {
        const r = await fetch(`${BASE}/global-metrics/quotes/latest?convert=${input.convert || "USD"}`, { headers });
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

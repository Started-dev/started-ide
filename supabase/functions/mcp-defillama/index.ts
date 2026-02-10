import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.llama.fi";
const YIELDS = "https://yields.llama.fi";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input } = await req.json();
    let result: unknown;

    switch (tool) {
      case "defi_protocols": {
        const r = await fetch(`${BASE}/protocols`);
        result = await r.json();
        break;
      }
      case "defi_protocol_tvl": {
        const r = await fetch(`${BASE}/protocol/${input.protocol}`);
        result = await r.json();
        break;
      }
      case "defi_tvl_chains": {
        const r = await fetch(`${BASE}/v2/chains`);
        result = await r.json();
        break;
      }
      case "defi_global_tvl": {
        const r = await fetch(`${BASE}/v2/historicalChainTvl`);
        result = await r.json();
        break;
      }
      case "defi_yields": {
        const r = await fetch(`${YIELDS}/pools`);
        const data = await r.json();
        result = data.data?.slice(0, input.limit || 25);
        break;
      }
      case "defi_stablecoins": {
        const r = await fetch(`https://stablecoins.llama.fi/stablecoins?includePrices=true`);
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

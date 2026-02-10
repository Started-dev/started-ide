import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.coingecko.com/api/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input } = await req.json();
    let result: unknown;

    switch (tool) {
      case "coingecko_ping": {
        const r = await fetch(`${BASE}/ping`);
        result = await r.json();
        break;
      }
      case "coingecko_price": {
        const r = await fetch(`${BASE}/simple/price?ids=${input.ids}&vs_currencies=${input.vs_currencies || "usd"}&include_24hr_change=${input.include_24hr_change || true}`);
        result = await r.json();
        break;
      }
      case "coingecko_coin_detail": {
        const r = await fetch(`${BASE}/coins/${input.id}?localization=false&tickers=false&community_data=false&developer_data=false`);
        result = await r.json();
        break;
      }
      case "coingecko_market_chart": {
        const r = await fetch(`${BASE}/coins/${input.id}/market_chart?vs_currency=${input.vs_currency || "usd"}&days=${input.days || 7}`);
        result = await r.json();
        break;
      }
      case "coingecko_trending": {
        const r = await fetch(`${BASE}/search/trending`);
        result = await r.json();
        break;
      }
      case "coingecko_markets": {
        const r = await fetch(`${BASE}/coins/markets?vs_currency=${input.vs_currency || "usd"}&order=${input.order || "market_cap_desc"}&per_page=${input.per_page || 25}&page=${input.page || 1}`);
        result = await r.json();
        break;
      }
      case "coingecko_search": {
        const r = await fetch(`${BASE}/search?query=${encodeURIComponent(input.query)}`);
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

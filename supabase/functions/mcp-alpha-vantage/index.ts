import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://www.alphavantage.co/query";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, alpha_vantage_key } = await req.json();
    if (!alpha_vantage_key) return new Response(JSON.stringify({ ok: false, error: "alpha_vantage_key required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let url: string;
    switch (tool) {
      case "av_quote": url = `${BASE}?function=GLOBAL_QUOTE&symbol=${input.symbol}&apikey=${alpha_vantage_key}`; break;
      case "av_search": url = `${BASE}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(input.keywords)}&apikey=${alpha_vantage_key}`; break;
      case "av_time_series_daily": url = `${BASE}?function=TIME_SERIES_DAILY&symbol=${input.symbol}&outputsize=${input.outputsize || "compact"}&apikey=${alpha_vantage_key}`; break;
      case "av_time_series_intraday": url = `${BASE}?function=TIME_SERIES_INTRADAY&symbol=${input.symbol}&interval=${input.interval || "5min"}&apikey=${alpha_vantage_key}`; break;
      case "av_forex_rate": url = `${BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${input.from}&to_currency=${input.to}&apikey=${alpha_vantage_key}`; break;
      case "av_crypto_rating": url = `${BASE}?function=CRYPTO_RATING&symbol=${input.symbol}&apikey=${alpha_vantage_key}`; break;
      case "av_sma": url = `${BASE}?function=SMA&symbol=${input.symbol}&interval=${input.interval || "daily"}&time_period=${input.time_period || 20}&series_type=${input.series_type || "close"}&apikey=${alpha_vantage_key}`; break;
      default:
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const r = await fetch(url);
    const result = await r.json();
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

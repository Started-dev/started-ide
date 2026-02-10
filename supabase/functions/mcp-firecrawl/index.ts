import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input } = await req.json();
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ ok: false, error: "FIRECRAWL_API_KEY not configured. Connect Firecrawl in project settings." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    let result: unknown;

    switch (tool) {
      case "firecrawl_scrape": {
        const r = await fetch("https://api.firecrawl.dev/v1/scrape", { method: "POST", headers, body: JSON.stringify({ url: input.url, formats: input.formats || ["markdown"], onlyMainContent: input.only_main_content ?? true }) });
        result = await r.json();
        break;
      }
      case "firecrawl_search": {
        const r = await fetch("https://api.firecrawl.dev/v1/search", { method: "POST", headers, body: JSON.stringify({ query: input.query, limit: input.limit || 10 }) });
        result = await r.json();
        break;
      }
      case "firecrawl_map": {
        const r = await fetch("https://api.firecrawl.dev/v1/map", { method: "POST", headers, body: JSON.stringify({ url: input.url, limit: input.limit || 100 }) });
        result = await r.json();
        break;
      }
      case "firecrawl_crawl": {
        const r = await fetch("https://api.firecrawl.dev/v1/crawl", { method: "POST", headers, body: JSON.stringify({ url: input.url, limit: input.limit || 50 }) });
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

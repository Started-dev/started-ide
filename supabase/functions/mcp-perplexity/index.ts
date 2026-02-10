import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input } = await req.json();
    const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ ok: false, error: "PERPLEXITY_API_KEY not configured. Connect Perplexity in project settings." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    let result: unknown;

    switch (tool) {
      case "perplexity_search": {
        const r = await fetch("https://api.perplexity.ai/chat/completions", { method: "POST", headers, body: JSON.stringify({ model: input.model || "sonar", messages: [{ role: "user", content: input.query }], search_recency_filter: input.recency }) });
        result = await r.json();
        break;
      }
      case "perplexity_research": {
        const r = await fetch("https://api.perplexity.ai/chat/completions", { method: "POST", headers, body: JSON.stringify({ model: "sonar-pro", messages: [{ role: "system", content: "Provide detailed, well-researched answers with citations." }, { role: "user", content: input.query }] }) });
        result = await r.json();
        break;
      }
      case "perplexity_reason": {
        const r = await fetch("https://api.perplexity.ai/chat/completions", { method: "POST", headers, body: JSON.stringify({ model: "sonar-reasoning", messages: [{ role: "user", content: input.query }] }) });
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, hf_token } = await req.json();
    if (!hf_token) return new Response(JSON.stringify({ ok: false, error: "hf_token required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${hf_token}`, "Content-Type": "application/json" };
    let result: unknown;

    switch (tool) {
      case "hf_inference": {
        const r = await fetch(`https://api-inference.huggingface.co/models/${input.model}`, { method: "POST", headers, body: JSON.stringify({ inputs: input.inputs, parameters: input.parameters }) });
        result = await r.json();
        break;
      }
      case "hf_list_models": {
        const r = await fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(input.search || "")}&limit=${input.limit || 10}&sort=${input.sort || "downloads"}&direction=-1`, { headers });
        result = await r.json();
        break;
      }
      case "hf_model_info": {
        const r = await fetch(`https://huggingface.co/api/models/${input.model_id}`, { headers });
        result = await r.json();
        break;
      }
      case "hf_text_generation": {
        const r = await fetch(`https://api-inference.huggingface.co/models/${input.model || "mistralai/Mistral-7B-Instruct-v0.2"}`, { method: "POST", headers, body: JSON.stringify({ inputs: input.prompt, parameters: { max_new_tokens: input.max_tokens || 256, temperature: input.temperature || 0.7 } }) });
        result = await r.json();
        break;
      }
      case "hf_text_classification": {
        const r = await fetch(`https://api-inference.huggingface.co/models/${input.model || "distilbert-base-uncased-finetuned-sst-2-english"}`, { method: "POST", headers, body: JSON.stringify({ inputs: input.text }) });
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

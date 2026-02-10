import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, google_api_key } = await req.json();
    if (!google_api_key) return new Response(JSON.stringify({ ok: false, error: "google_api_key required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const headers = { Authorization: `Bearer ${google_api_key}`, "Content-Type": "application/json" };
    let result: unknown;

    switch (tool) {
      case "sheets_get_spreadsheet": {
        const r = await fetch(`${BASE}/${input.spreadsheet_id}`, { headers });
        result = await r.json();
        break;
      }
      case "sheets_get_values": {
        const r = await fetch(`${BASE}/${input.spreadsheet_id}/values/${encodeURIComponent(input.range)}`, { headers });
        result = await r.json();
        break;
      }
      case "sheets_update_values": {
        const r = await fetch(`${BASE}/${input.spreadsheet_id}/values/${encodeURIComponent(input.range)}?valueInputOption=${input.value_input_option || "USER_ENTERED"}`, { method: "PUT", headers, body: JSON.stringify({ values: input.values }) });
        result = await r.json();
        break;
      }
      case "sheets_append_values": {
        const r = await fetch(`${BASE}/${input.spreadsheet_id}/values/${encodeURIComponent(input.range)}:append?valueInputOption=${input.value_input_option || "USER_ENTERED"}`, { method: "POST", headers, body: JSON.stringify({ values: input.values }) });
        result = await r.json();
        break;
      }
      case "sheets_clear_values": {
        const r = await fetch(`${BASE}/${input.spreadsheet_id}/values/${encodeURIComponent(input.range)}:clear`, { method: "POST", headers });
        result = await r.json();
        break;
      }
      case "sheets_create_spreadsheet": {
        const r = await fetch(BASE, { method: "POST", headers, body: JSON.stringify({ properties: { title: input.title } }) });
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

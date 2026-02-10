import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AIRTABLE_API = "https://api.airtable.com/v0";
const AIRTABLE_META = "https://api.airtable.com/v0/meta";

async function airtableFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${AIRTABLE_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, airtable_token } = await req.json();
    if (!airtable_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing airtable_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      case "airtable_list_bases": {
        result = await airtableFetch(`${AIRTABLE_META}/bases`, airtable_token);
        break;
      }
      case "airtable_get_base_schema": {
        const { base_id } = input;
        result = await airtableFetch(`${AIRTABLE_META}/bases/${base_id}/tables`, airtable_token);
        break;
      }
      case "airtable_list_records": {
        const { base_id, table_id_or_name, max_records, view, filter_formula } = input;
        const params = new URLSearchParams();
        if (max_records) params.set("maxRecords", String(max_records));
        if (view) params.set("view", view);
        if (filter_formula) params.set("filterByFormula", filter_formula);
        const qs = params.toString();
        result = await airtableFetch(`/${base_id}/${encodeURIComponent(table_id_or_name)}${qs ? `?${qs}` : ""}`, airtable_token);
        break;
      }
      case "airtable_get_record": {
        const { base_id, table_id_or_name, record_id } = input;
        result = await airtableFetch(`/${base_id}/${encodeURIComponent(table_id_or_name)}/${record_id}`, airtable_token);
        break;
      }
      case "airtable_create_records": {
        const { base_id, table_id_or_name, records } = input;
        result = await airtableFetch(`/${base_id}/${encodeURIComponent(table_id_or_name)}`, airtable_token, {
          method: "POST",
          body: JSON.stringify({ records: records.map((r: any) => ({ fields: r })) }),
        });
        break;
      }
      case "airtable_update_records": {
        const { base_id, table_id_or_name, records } = input;
        result = await airtableFetch(`/${base_id}/${encodeURIComponent(table_id_or_name)}`, airtable_token, {
          method: "PATCH",
          body: JSON.stringify({ records }),
        });
        break;
      }
      case "airtable_delete_records": {
        const { base_id, table_id_or_name, record_ids } = input;
        const params = (record_ids as string[]).map(id => `records[]=${id}`).join("&");
        result = await airtableFetch(`/${base_id}/${encodeURIComponent(table_id_or_name)}?${params}`, airtable_token, {
          method: "DELETE",
        });
        break;
      }
      case "airtable_create_table": {
        const { base_id, name, fields, description } = input;
        result = await airtableFetch(`${AIRTABLE_META}/bases/${base_id}/tables`, airtable_token, {
          method: "POST",
          body: JSON.stringify({ name, fields, description }),
        });
        break;
      }
      default:
        return new Response(JSON.stringify({ ok: false, error: `Unknown tool: ${tool}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});

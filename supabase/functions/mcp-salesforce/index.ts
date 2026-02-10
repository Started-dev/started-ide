import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, sf_instance_url, sf_access_token } = await req.json();
    if (!sf_instance_url || !sf_access_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing sf_instance_url or sf_access_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const base = sf_instance_url.replace(/\/$/, "");

    async function sfFetch(path: string, opts: RequestInit = {}) {
      const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${sf_access_token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
      return parsed;
    }

    let result: unknown;

    switch (tool) {
      case "sf_query": {
        result = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(input.soql)}`);
        break;
      }
      case "sf_get_record": {
        result = await sfFetch(`/services/data/v59.0/sobjects/${input.object_type}/${input.record_id}`);
        break;
      }
      case "sf_create_record": {
        result = await sfFetch(`/services/data/v59.0/sobjects/${input.object_type}`, {
          method: "POST",
          body: JSON.stringify(input.fields),
        });
        break;
      }
      case "sf_update_record": {
        await sfFetch(`/services/data/v59.0/sobjects/${input.object_type}/${input.record_id}`, {
          method: "PATCH",
          body: JSON.stringify(input.fields),
        });
        result = { updated: true, id: input.record_id };
        break;
      }
      case "sf_delete_record": {
        await sfFetch(`/services/data/v59.0/sobjects/${input.object_type}/${input.record_id}`, {
          method: "DELETE",
        });
        result = { deleted: true, id: input.record_id };
        break;
      }
      case "sf_describe_object": {
        result = await sfFetch(`/services/data/v59.0/sobjects/${input.object_type}/describe`);
        break;
      }
      case "sf_list_objects": {
        result = await sfFetch(`/services/data/v59.0/sobjects`);
        break;
      }
      case "sf_search": {
        result = await sfFetch(`/services/data/v59.0/search?q=${encodeURIComponent(input.sosl)}`);
        break;
      }
      case "sf_list_leads": {
        const limit = input.limit || 20;
        result = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id,Name,Email,Company,Status FROM Lead ORDER BY CreatedDate DESC LIMIT ${limit}`)}`);
        break;
      }
      case "sf_list_contacts": {
        const limit = input.limit || 20;
        result = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id,Name,Email,Phone,Account.Name FROM Contact ORDER BY CreatedDate DESC LIMIT ${limit}`)}`);
        break;
      }
      case "sf_list_opportunities": {
        const limit = input.limit || 20;
        result = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(`SELECT Id,Name,StageName,Amount,CloseDate,Account.Name FROM Opportunity ORDER BY CreatedDate DESC LIMIT ${limit}`)}`);
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

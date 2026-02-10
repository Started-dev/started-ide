import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HUBSPOT_API = "https://api.hubapi.com";

async function hsFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
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
    const { tool, input, hubspot_token } = await req.json();
    if (!hubspot_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing hubspot_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      // ── Contacts ──
      case "hubspot_list_contacts": {
        const limit = input.limit || 20;
        result = await hsFetch(`/crm/v3/objects/contacts?limit=${limit}&properties=firstname,lastname,email,phone,company`, hubspot_token);
        break;
      }
      case "hubspot_get_contact": {
        result = await hsFetch(`/crm/v3/objects/contacts/${input.contact_id}?properties=firstname,lastname,email,phone,company`, hubspot_token);
        break;
      }
      case "hubspot_create_contact": {
        result = await hsFetch(`/crm/v3/objects/contacts`, hubspot_token, {
          method: "POST",
          body: JSON.stringify({ properties: input.properties }),
        });
        break;
      }
      case "hubspot_update_contact": {
        result = await hsFetch(`/crm/v3/objects/contacts/${input.contact_id}`, hubspot_token, {
          method: "PATCH",
          body: JSON.stringify({ properties: input.properties }),
        });
        break;
      }
      // ── Deals ──
      case "hubspot_list_deals": {
        const limit = input.limit || 20;
        result = await hsFetch(`/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,closedate,pipeline`, hubspot_token);
        break;
      }
      case "hubspot_get_deal": {
        result = await hsFetch(`/crm/v3/objects/deals/${input.deal_id}?properties=dealname,amount,dealstage,closedate,pipeline`, hubspot_token);
        break;
      }
      case "hubspot_create_deal": {
        result = await hsFetch(`/crm/v3/objects/deals`, hubspot_token, {
          method: "POST",
          body: JSON.stringify({ properties: input.properties }),
        });
        break;
      }
      case "hubspot_update_deal": {
        result = await hsFetch(`/crm/v3/objects/deals/${input.deal_id}`, hubspot_token, {
          method: "PATCH",
          body: JSON.stringify({ properties: input.properties }),
        });
        break;
      }
      // ── Companies ──
      case "hubspot_list_companies": {
        const limit = input.limit || 20;
        result = await hsFetch(`/crm/v3/objects/companies?limit=${limit}&properties=name,domain,industry,phone`, hubspot_token);
        break;
      }
      case "hubspot_create_company": {
        result = await hsFetch(`/crm/v3/objects/companies`, hubspot_token, {
          method: "POST",
          body: JSON.stringify({ properties: input.properties }),
        });
        break;
      }
      // ── Pipelines ──
      case "hubspot_list_pipelines": {
        const objectType = input.object_type || "deals";
        result = await hsFetch(`/crm/v3/pipelines/${objectType}`, hubspot_token);
        break;
      }
      // ── Search ──
      case "hubspot_search": {
        const objectType = input.object_type || "contacts";
        result = await hsFetch(`/crm/v3/objects/${objectType}/search`, hubspot_token, {
          method: "POST",
          body: JSON.stringify({
            query: input.query,
            limit: input.limit || 20,
            properties: input.properties || [],
          }),
        });
        break;
      }
      // ── Owners ──
      case "hubspot_list_owners": {
        result = await hsFetch(`/crm/v3/owners?limit=${input.limit || 100}`, hubspot_token);
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

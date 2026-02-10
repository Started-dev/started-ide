import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SG_API = "https://api.sendgrid.com/v3";

async function sgFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${SG_API}${path}`, {
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
    const { tool, input, sendgrid_api_key } = await req.json();
    if (!sendgrid_api_key) {
      return new Response(JSON.stringify({ ok: false, error: "Missing sendgrid_api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      // ── Send ──
      case "sendgrid_send_email": {
        const { to, from, subject, text, html, template_id, dynamic_template_data } = input;
        const body: Record<string, unknown> = {
          personalizations: [{ to: Array.isArray(to) ? to.map((e: string) => ({ email: e })) : [{ email: to }] }],
          from: typeof from === "string" ? { email: from } : from,
          subject,
        };
        if (template_id) {
          body.template_id = template_id;
          if (dynamic_template_data) body.personalizations[0].dynamic_template_data = dynamic_template_data;
        } else {
          body.content = [];
          if (text) (body.content as unknown[]).push({ type: "text/plain", value: text });
          if (html) (body.content as unknown[]).push({ type: "text/html", value: html });
        }
        await sgFetch("/mail/send", sendgrid_api_key, { method: "POST", body: JSON.stringify(body) });
        result = { sent: true };
        break;
      }
      // ── Contacts ──
      case "sendgrid_list_contacts": {
        result = await sgFetch(`/marketing/contacts?page_size=${input.page_size || 50}`, sendgrid_api_key);
        break;
      }
      case "sendgrid_search_contacts": {
        result = await sgFetch("/marketing/contacts/search", sendgrid_api_key, {
          method: "POST", body: JSON.stringify({ query: input.query }),
        });
        break;
      }
      case "sendgrid_add_contacts": {
        const body: Record<string, unknown> = { contacts: input.contacts };
        if (input.list_ids) body.list_ids = input.list_ids;
        result = await sgFetch("/marketing/contacts", sendgrid_api_key, {
          method: "PUT", body: JSON.stringify(body),
        });
        break;
      }
      case "sendgrid_delete_contacts": {
        const ids = (input.ids as string[]).join(",");
        result = await sgFetch(`/marketing/contacts?ids=${ids}`, sendgrid_api_key, { method: "DELETE" });
        break;
      }
      // ── Lists ──
      case "sendgrid_list_lists": {
        result = await sgFetch(`/marketing/lists?page_size=${input.page_size || 50}`, sendgrid_api_key);
        break;
      }
      case "sendgrid_create_list": {
        result = await sgFetch("/marketing/lists", sendgrid_api_key, {
          method: "POST", body: JSON.stringify({ name: input.name }),
        });
        break;
      }
      case "sendgrid_delete_list": {
        await sgFetch(`/marketing/lists/${input.list_id}`, sendgrid_api_key, { method: "DELETE" });
        result = { deleted: true, list_id: input.list_id };
        break;
      }
      // ── Templates ──
      case "sendgrid_list_templates": {
        const gen = input.generations || "dynamic";
        result = await sgFetch(`/templates?generations=${gen}&page_size=${input.page_size || 50}`, sendgrid_api_key);
        break;
      }
      case "sendgrid_get_template": {
        result = await sgFetch(`/templates/${input.template_id}`, sendgrid_api_key);
        break;
      }
      // ── Stats ──
      case "sendgrid_get_stats": {
        const start = input.start_date;
        const end = input.end_date ? `&end_date=${input.end_date}` : "";
        result = await sgFetch(`/stats?start_date=${start}${end}`, sendgrid_api_key);
        break;
      }
      // ── Senders ──
      case "sendgrid_list_senders": {
        result = await sgFetch("/verified_senders", sendgrid_api_key);
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://api.telegram.org";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, telegram_bot_token } = await req.json();
    if (!telegram_bot_token) return new Response(JSON.stringify({ ok: false, error: "telegram_bot_token required" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const api = `${BASE}/bot${telegram_bot_token}`;
    let result: unknown;

    switch (tool) {
      case "telegram_get_me": {
        const r = await fetch(`${api}/getMe`);
        result = await r.json();
        break;
      }
      case "telegram_send_message": {
        const r = await fetch(`${api}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: input.chat_id, text: input.text, parse_mode: input.parse_mode }) });
        result = await r.json();
        break;
      }
      case "telegram_get_updates": {
        const r = await fetch(`${api}/getUpdates?limit=${input.limit || 10}&offset=${input.offset || 0}`);
        result = await r.json();
        break;
      }
      case "telegram_get_chat": {
        const r = await fetch(`${api}/getChat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: input.chat_id }) });
        result = await r.json();
        break;
      }
      case "telegram_get_chat_members_count": {
        const r = await fetch(`${api}/getChatMemberCount`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: input.chat_id }) });
        result = await r.json();
        break;
      }
      case "telegram_set_webhook": {
        const r = await fetch(`${api}/setWebhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: input.url }) });
        result = await r.json();
        break;
      }
      case "telegram_delete_webhook": {
        const r = await fetch(`${api}/deleteWebhook`);
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

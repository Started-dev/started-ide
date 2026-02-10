import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRELLO_API = "https://api.trello.com/1";

async function trelloFetch(path: string, key: string, token: string, opts: RequestInit = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${TRELLO_API}${path}${sep}key=${key}&token=${token}`;
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, trello_api_key, trello_token } = await req.json();
    if (!trello_api_key || !trello_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing trello_api_key or trello_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      case "trello_list_boards": {
        result = await trelloFetch("/members/me/boards?fields=name,desc,url,closed", trello_api_key, trello_token);
        break;
      }
      case "trello_get_board": {
        result = await trelloFetch(`/boards/${input.board_id}?fields=name,desc,url,closed,prefs`, trello_api_key, trello_token);
        break;
      }
      case "trello_list_lists": {
        result = await trelloFetch(`/boards/${input.board_id}/lists?fields=name,closed,pos`, trello_api_key, trello_token);
        break;
      }
      case "trello_create_list": {
        result = await trelloFetch(`/boards/${input.board_id}/lists`, trello_api_key, trello_token, {
          method: "POST",
          body: JSON.stringify({ name: input.name, pos: input.pos || "bottom" }),
        });
        break;
      }
      case "trello_list_cards": {
        result = await trelloFetch(`/lists/${input.list_id}/cards?fields=name,desc,due,closed,url,labels,idMembers`, trello_api_key, trello_token);
        break;
      }
      case "trello_get_card": {
        result = await trelloFetch(`/cards/${input.card_id}?fields=name,desc,due,closed,url,labels,idMembers,idList`, trello_api_key, trello_token);
        break;
      }
      case "trello_create_card": {
        const body: Record<string, unknown> = { name: input.name, idList: input.list_id };
        if (input.desc) body.desc = input.desc;
        if (input.due) body.due = input.due;
        if (input.pos) body.pos = input.pos;
        result = await trelloFetch("/cards", trello_api_key, trello_token, {
          method: "POST", body: JSON.stringify(body),
        });
        break;
      }
      case "trello_update_card": {
        result = await trelloFetch(`/cards/${input.card_id}`, trello_api_key, trello_token, {
          method: "PUT", body: JSON.stringify(input.fields),
        });
        break;
      }
      case "trello_delete_card": {
        await trelloFetch(`/cards/${input.card_id}`, trello_api_key, trello_token, { method: "DELETE" });
        result = { deleted: true, card_id: input.card_id };
        break;
      }
      case "trello_move_card": {
        result = await trelloFetch(`/cards/${input.card_id}`, trello_api_key, trello_token, {
          method: "PUT", body: JSON.stringify({ idList: input.list_id, pos: input.pos || "bottom" }),
        });
        break;
      }
      case "trello_add_comment": {
        result = await trelloFetch(`/cards/${input.card_id}/actions/comments`, trello_api_key, trello_token, {
          method: "POST", body: JSON.stringify({ text: input.text }),
        });
        break;
      }
      case "trello_list_members": {
        result = await trelloFetch(`/boards/${input.board_id}/members?fields=fullName,username`, trello_api_key, trello_token);
        break;
      }
      case "trello_list_labels": {
        result = await trelloFetch(`/boards/${input.board_id}/labels?fields=name,color`, trello_api_key, trello_token);
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

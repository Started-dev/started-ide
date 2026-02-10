import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONDAY_API = "https://api.monday.com/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, monday_token } = await req.json();
    if (!monday_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing monday_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    async function mondayQuery(query: string, variables?: Record<string, unknown>) {
      const res = await fetch(MONDAY_API, {
        method: "POST",
        headers: { Authorization: monday_token, "Content-Type": "application/json", "API-Version": "2024-01" },
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
      if (parsed.errors) throw new Error(JSON.stringify(parsed.errors));
      return parsed.data;
    }

    let result: unknown;

    switch (tool) {
      case "monday_list_boards": {
        const limit = input.limit || 20;
        result = await mondayQuery(`{ boards(limit: ${limit}) { id name state board_kind columns { id title type } } }`);
        break;
      }
      case "monday_get_board": {
        result = await mondayQuery(`{ boards(ids: [${input.board_id}]) { id name description state columns { id title type } groups { id title } } }`);
        break;
      }
      case "monday_list_items": {
        const limit = input.limit || 25;
        result = await mondayQuery(`{ boards(ids: [${input.board_id}]) { items_page(limit: ${limit}) { items { id name state group { id title } column_values { id text value } } } } }`);
        break;
      }
      case "monday_get_item": {
        result = await mondayQuery(`{ items(ids: [${input.item_id}]) { id name state board { id name } group { id title } column_values { id text value } updates { id body created_at } } }`);
        break;
      }
      case "monday_create_item": {
        const colVals = input.column_values ? JSON.stringify(JSON.stringify(input.column_values)) : '"{}"';
        const group = input.group_id ? `, group_id: "${input.group_id}"` : "";
        result = await mondayQuery(`mutation { create_item(board_id: ${input.board_id}, item_name: "${input.item_name}"${group}, column_values: ${colVals}) { id name } }`);
        break;
      }
      case "monday_update_item": {
        const colVals = JSON.stringify(JSON.stringify(input.column_values));
        result = await mondayQuery(`mutation { change_multiple_column_values(board_id: ${input.board_id}, item_id: ${input.item_id}, column_values: ${colVals}) { id name } }`);
        break;
      }
      case "monday_delete_item": {
        result = await mondayQuery(`mutation { delete_item(item_id: ${input.item_id}) { id } }`);
        break;
      }
      case "monday_add_update": {
        result = await mondayQuery(`mutation { create_update(item_id: ${input.item_id}, body: "${input.body.replace(/"/g, '\\"')}") { id body created_at } }`);
        break;
      }
      case "monday_list_groups": {
        result = await mondayQuery(`{ boards(ids: [${input.board_id}]) { groups { id title color position } } }`);
        break;
      }
      case "monday_create_group": {
        result = await mondayQuery(`mutation { create_group(board_id: ${input.board_id}, group_name: "${input.group_name}") { id title } }`);
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

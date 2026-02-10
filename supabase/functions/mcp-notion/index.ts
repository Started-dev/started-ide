import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function notionFetch(path: string, token: string, options: RequestInit = {}) {
  const resp = await fetch(`https://api.notion.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `Notion API error: ${resp.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { tool, input, notion_token } = await req.json();
    if (!tool || !notion_token) {
      return json({ error: "missing 'tool' or 'notion_token'" }, 400);
    }

    let result: unknown;

    switch (tool) {
      case "notion_search": {
        const { query, filter, page_size } = input || {};
        const body: Record<string, unknown> = {};
        if (query) body.query = query;
        if (filter) body.filter = filter;
        if (page_size) body.page_size = page_size;
        result = await notionFetch("search", notion_token, {
          method: "POST",
          body: JSON.stringify(body),
        });
        break;
      }

      case "notion_get_page": {
        const { page_id } = input || {};
        if (!page_id) return json({ error: "page_id required" }, 400);
        result = await notionFetch(`pages/${page_id}`, notion_token);
        break;
      }

      case "notion_get_page_content": {
        const { block_id, page_size } = input || {};
        if (!block_id) return json({ error: "block_id required" }, 400);
        const qs = page_size ? `?page_size=${page_size}` : "";
        result = await notionFetch(`blocks/${block_id}/children${qs}`, notion_token);
        break;
      }

      case "notion_create_page": {
        const { parent, properties, children } = input || {};
        if (!parent) return json({ error: "parent required" }, 400);
        const body: Record<string, unknown> = { parent, properties: properties || {} };
        if (children) body.children = children;
        result = await notionFetch("pages", notion_token, {
          method: "POST",
          body: JSON.stringify(body),
        });
        break;
      }

      case "notion_update_page": {
        const { page_id, properties, archived } = input || {};
        if (!page_id) return json({ error: "page_id required" }, 400);
        const body: Record<string, unknown> = {};
        if (properties) body.properties = properties;
        if (archived !== undefined) body.archived = archived;
        result = await notionFetch(`pages/${page_id}`, notion_token, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        break;
      }

      case "notion_query_database": {
        const { database_id, filter, sorts, page_size, start_cursor } = input || {};
        if (!database_id) return json({ error: "database_id required" }, 400);
        const body: Record<string, unknown> = {};
        if (filter) body.filter = filter;
        if (sorts) body.sorts = sorts;
        if (page_size) body.page_size = page_size;
        if (start_cursor) body.start_cursor = start_cursor;
        result = await notionFetch(`databases/${database_id}/query`, notion_token, {
          method: "POST",
          body: JSON.stringify(body),
        });
        break;
      }

      case "notion_get_database": {
        const { database_id } = input || {};
        if (!database_id) return json({ error: "database_id required" }, 400);
        result = await notionFetch(`databases/${database_id}`, notion_token);
        break;
      }

      case "notion_list_databases": {
        result = await notionFetch("search", notion_token, {
          method: "POST",
          body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: input?.page_size || 100 }),
        });
        break;
      }

      case "notion_append_blocks": {
        const { block_id, children } = input || {};
        if (!block_id || !children) return json({ error: "block_id and children required" }, 400);
        result = await notionFetch(`blocks/${block_id}/children`, notion_token, {
          method: "PATCH",
          body: JSON.stringify({ children }),
        });
        break;
      }

      case "notion_delete_block": {
        const { block_id } = input || {};
        if (!block_id) return json({ error: "block_id required" }, 400);
        result = await notionFetch(`blocks/${block_id}`, notion_token, {
          method: "DELETE",
        });
        break;
      }

      default:
        return json({ error: `Unknown tool: ${tool}` }, 400);
    }

    return json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ ok: false, error: message }, 500);
  }
});

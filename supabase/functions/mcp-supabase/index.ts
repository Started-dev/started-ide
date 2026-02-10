import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MGMT_API = "https://api.supabase.com/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function mgmtFetch(path: string, token: string, options: RequestInit = {}) {
  const resp = await fetch(`${MGMT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || data.error || `Supabase API ${resp.status}`);
  return data;
}

async function projectQuery(projectRef: string, token: string, query: string) {
  const resp = await fetch(`${MGMT_API}/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || data.error || `Query failed ${resp.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate caller via Supabase JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { tool, input, supabase_token } = await req.json();
    if (!tool || !supabase_token) {
      return json({ error: "missing 'tool' or 'supabase_token'" }, 400);
    }

    let result: unknown;

    switch (tool) {
      // ─── Projects ───
      case "supabase_list_projects": {
        result = await mgmtFetch("/projects", supabase_token);
        break;
      }

      case "supabase_get_project": {
        const { ref } = input || {};
        if (!ref) return json({ error: "ref (project ref) required" }, 400);
        result = await mgmtFetch(`/projects/${ref}`, supabase_token);
        break;
      }

      // ─── Database ───
      case "supabase_list_tables": {
        const { ref } = input || {};
        if (!ref) return json({ error: "ref required" }, 400);
        result = await projectQuery(ref, supabase_token,
          `SELECT table_name, table_schema FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
        );
        break;
      }

      case "supabase_run_query": {
        const { ref, query } = input || {};
        if (!ref || !query) return json({ error: "ref, query required" }, 400);
        // Safety: only allow SELECT
        const trimmed = (query as string).trim().toUpperCase();
        if (!trimmed.startsWith("SELECT")) {
          return json({ error: "Only SELECT queries are allowed for safety" }, 400);
        }
        result = await projectQuery(ref, supabase_token, query as string);
        break;
      }

      case "supabase_get_table_schema": {
        const { ref, table } = input || {};
        if (!ref || !table) return json({ error: "ref, table required" }, 400);
        result = await projectQuery(ref, supabase_token,
          `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${(table as string).replace(/'/g, "''")}'`
        );
        break;
      }

      // ─── Storage ───
      case "supabase_list_buckets": {
        const { ref } = input || {};
        if (!ref) return json({ error: "ref required" }, 400);
        result = await projectQuery(ref, supabase_token,
          `SELECT id, name, public, created_at FROM storage.buckets ORDER BY name`
        );
        break;
      }

      // ─── Auth ───
      case "supabase_list_users": {
        const { ref, page, per_page } = input || {};
        if (!ref) return json({ error: "ref required" }, 400);
        const pg = page || 1;
        const pp = per_page || 50;
        result = await mgmtFetch(`/projects/${ref}/auth/users?page=${pg}&per_page=${pp}`, supabase_token);
        break;
      }

      // ─── Edge Functions ───
      case "supabase_list_functions": {
        const { ref } = input || {};
        if (!ref) return json({ error: "ref required" }, 400);
        result = await mgmtFetch(`/projects/${ref}/functions`, supabase_token);
        break;
      }

      case "supabase_get_function": {
        const { ref, slug } = input || {};
        if (!ref || !slug) return json({ error: "ref, slug required" }, 400);
        result = await mgmtFetch(`/projects/${ref}/functions/${slug}`, supabase_token);
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

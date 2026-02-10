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

async function n8nFetch(baseUrl: string, path: string, apiKey: string, options: RequestInit = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      "X-N8N-API-KEY": apiKey,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `n8n API error: ${resp.status}`);
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

    const { tool, input, n8n_api_key, n8n_base_url } = await req.json();
    if (!tool || !n8n_api_key || !n8n_base_url) {
      return json({ error: "missing 'tool', 'n8n_api_key', or 'n8n_base_url'" }, 400);
    }

    let result: unknown;

    switch (tool) {
      case "n8n_list_workflows": {
        const limit = input?.limit || 50;
        result = await n8nFetch(n8n_base_url, `workflows?limit=${limit}`, n8n_api_key);
        break;
      }

      case "n8n_get_workflow": {
        const { workflow_id } = input || {};
        if (!workflow_id) return json({ error: "workflow_id required" }, 400);
        result = await n8nFetch(n8n_base_url, `workflows/${workflow_id}`, n8n_api_key);
        break;
      }

      case "n8n_activate_workflow": {
        const { workflow_id } = input || {};
        if (!workflow_id) return json({ error: "workflow_id required" }, 400);
        result = await n8nFetch(n8n_base_url, `workflows/${workflow_id}/activate`, n8n_api_key, {
          method: "POST",
        });
        break;
      }

      case "n8n_deactivate_workflow": {
        const { workflow_id } = input || {};
        if (!workflow_id) return json({ error: "workflow_id required" }, 400);
        result = await n8nFetch(n8n_base_url, `workflows/${workflow_id}/deactivate`, n8n_api_key, {
          method: "POST",
        });
        break;
      }

      case "n8n_list_executions": {
        const { workflow_id, limit, status } = input || {};
        let qs = `limit=${limit || 20}`;
        if (workflow_id) qs += `&workflowId=${workflow_id}`;
        if (status) qs += `&status=${status}`;
        result = await n8nFetch(n8n_base_url, `executions?${qs}`, n8n_api_key);
        break;
      }

      case "n8n_get_execution": {
        const { execution_id } = input || {};
        if (!execution_id) return json({ error: "execution_id required" }, 400);
        result = await n8nFetch(n8n_base_url, `executions/${execution_id}`, n8n_api_key);
        break;
      }

      case "n8n_trigger_webhook": {
        const { webhook_url, payload } = input || {};
        if (!webhook_url) return json({ error: "webhook_url required" }, 400);
        const resp = await fetch(webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
        });
        result = { status: resp.status, body: await resp.text() };
        break;
      }

      case "n8n_list_credentials": {
        result = await n8nFetch(n8n_base_url, "credentials", n8n_api_key);
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

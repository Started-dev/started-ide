import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASANA_API = "https://app.asana.com/api/1.0";

async function asanaFetch(path: string, token: string, opts: RequestInit = {}) {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
  return parsed.data ?? parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, asana_token } = await req.json();
    if (!asana_token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing asana_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    let result: unknown;

    switch (tool) {
      case "asana_list_workspaces": {
        result = await asanaFetch("/workspaces?opt_fields=name,is_organization", asana_token);
        break;
      }
      case "asana_list_projects": {
        const ws = input.workspace_gid ? `&workspace=${input.workspace_gid}` : "";
        result = await asanaFetch(`/projects?opt_fields=name,color,current_status,due_on${ws}&limit=${input.limit || 20}`, asana_token);
        break;
      }
      case "asana_get_project": {
        result = await asanaFetch(`/projects/${input.project_gid}?opt_fields=name,notes,current_status,due_on,owner,team`, asana_token);
        break;
      }
      case "asana_list_tasks": {
        const params = input.project_gid
          ? `project=${input.project_gid}`
          : input.assignee && input.workspace_gid
            ? `assignee=${input.assignee}&workspace=${input.workspace_gid}`
            : `project=${input.project_gid}`;
        result = await asanaFetch(`/tasks?${params}&opt_fields=name,completed,due_on,assignee.name&limit=${input.limit || 25}`, asana_token);
        break;
      }
      case "asana_get_task": {
        result = await asanaFetch(`/tasks/${input.task_gid}?opt_fields=name,notes,completed,due_on,assignee.name,projects.name,tags.name`, asana_token);
        break;
      }
      case "asana_create_task": {
        const body: Record<string, unknown> = { name: input.name };
        if (input.projects) body.projects = input.projects;
        if (input.assignee) body.assignee = input.assignee;
        if (input.due_on) body.due_on = input.due_on;
        if (input.notes) body.notes = input.notes;
        if (input.workspace_gid) body.workspace = input.workspace_gid;
        result = await asanaFetch("/tasks", asana_token, {
          method: "POST",
          body: JSON.stringify({ data: body }),
        });
        break;
      }
      case "asana_update_task": {
        result = await asanaFetch(`/tasks/${input.task_gid}`, asana_token, {
          method: "PUT",
          body: JSON.stringify({ data: input.fields }),
        });
        break;
      }
      case "asana_delete_task": {
        await asanaFetch(`/tasks/${input.task_gid}`, asana_token, { method: "DELETE" });
        result = { deleted: true, gid: input.task_gid };
        break;
      }
      case "asana_add_comment": {
        result = await asanaFetch(`/tasks/${input.task_gid}/stories`, asana_token, {
          method: "POST",
          body: JSON.stringify({ data: { text: input.text } }),
        });
        break;
      }
      case "asana_list_sections": {
        result = await asanaFetch(`/projects/${input.project_gid}/sections?opt_fields=name`, asana_token);
        break;
      }
      case "asana_search_tasks": {
        const ws = input.workspace_gid;
        const params = new URLSearchParams();
        if (input.text) params.set("text", input.text);
        if (input.completed !== undefined) params.set("completed", String(input.completed));
        params.set("opt_fields", "name,completed,due_on,assignee.name");
        result = await asanaFetch(`/workspaces/${ws}/tasks/search?${params.toString()}`, asana_token);
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

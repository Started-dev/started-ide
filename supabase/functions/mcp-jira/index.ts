import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tool, input, jira_email, jira_api_token, jira_domain } = await req.json();
    if (!jira_email || !jira_api_token || !jira_domain) {
      return new Response(JSON.stringify({ ok: false, error: "Missing jira_email, jira_api_token, or jira_domain" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    const baseUrl = jira_domain.startsWith("http") ? jira_domain : `https://${jira_domain}.atlassian.net`;
    const auth = btoa(`${jira_email}:${jira_api_token}`);

    async function jiraFetch(path: string, opts: RequestInit = {}) {
      const res = await fetch(`${baseUrl}/rest/api/3${path}`, {
        ...opts,
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(opts.headers || {}) },
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
      return parsed;
    }

    async function agile(path: string) {
      const res = await fetch(`${baseUrl}/rest/agile/1.0${path}`, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      if (!res.ok) throw new Error(typeof parsed === "object" ? JSON.stringify(parsed) : parsed);
      return parsed;
    }

    let result: unknown;

    switch (tool) {
      case "jira_list_projects": {
        result = await jiraFetch("/project?expand=description");
        break;
      }
      case "jira_get_project": {
        result = await jiraFetch(`/project/${input.project_key}`);
        break;
      }
      case "jira_search_issues": {
        const jql = input.jql || `project=${input.project_key} ORDER BY created DESC`;
        const max = input.max_results || 20;
        result = await jiraFetch(`/search?jql=${encodeURIComponent(jql)}&maxResults=${max}`);
        break;
      }
      case "jira_get_issue": {
        result = await jiraFetch(`/issue/${input.issue_key}`);
        break;
      }
      case "jira_create_issue": {
        const { project_key, summary, issue_type, description, assignee, priority, labels } = input;
        const fields: Record<string, unknown> = {
          project: { key: project_key },
          summary,
          issuetype: { name: issue_type || "Task" },
        };
        if (description) fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: description }] }] };
        if (assignee) fields.assignee = { accountId: assignee };
        if (priority) fields.priority = { name: priority };
        if (labels) fields.labels = labels;
        result = await jiraFetch("/issue", { method: "POST", body: JSON.stringify({ fields }) });
        break;
      }
      case "jira_update_issue": {
        const { issue_key, fields } = input;
        result = await jiraFetch(`/issue/${issue_key}`, { method: "PUT", body: JSON.stringify({ fields }) });
        result = { updated: true, key: issue_key };
        break;
      }
      case "jira_transition_issue": {
        const { issue_key, transition_id } = input;
        await jiraFetch(`/issue/${issue_key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: transition_id } }) });
        result = { transitioned: true, key: issue_key };
        break;
      }
      case "jira_get_transitions": {
        result = await jiraFetch(`/issue/${input.issue_key}/transitions`);
        break;
      }
      case "jira_add_comment": {
        const body = { body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: input.body }] }] } };
        result = await jiraFetch(`/issue/${input.issue_key}/comment`, { method: "POST", body: JSON.stringify(body) });
        break;
      }
      case "jira_list_sprints": {
        result = await agile(`/board/${input.board_id}/sprint?state=${input.state || "active"}`);
        break;
      }
      case "jira_get_sprint_issues": {
        result = await agile(`/sprint/${input.sprint_id}/issue?maxResults=${input.max_results || 50}`);
        break;
      }
      case "jira_assign_issue": {
        await jiraFetch(`/issue/${input.issue_key}/assignee`, { method: "PUT", body: JSON.stringify({ accountId: input.account_id }) });
        result = { assigned: true, key: input.issue_key };
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

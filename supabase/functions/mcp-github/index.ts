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

async function githubFetch(path: string, token: string, options: RequestInit = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `GitHub API ${resp.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate user via Supabase JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { tool, input, github_token } = await req.json();
    if (!tool || !github_token) {
      return json({ error: "missing 'tool' or 'github_token'" }, 400);
    }

    let result: unknown;

    switch (tool) {
      case "github_list_repos": {
        const page = input?.page || 1;
        const perPage = input?.per_page || 30;
        result = await githubFetch(`/user/repos?sort=updated&page=${page}&per_page=${perPage}`, github_token);
        break;
      }

      case "github_get_file": {
        const { owner, repo, path, ref } = input || {};
        if (!owner || !repo || !path) return json({ error: "owner, repo, path required" }, 400);
        const q = ref ? `?ref=${ref}` : "";
        const data = await githubFetch(`/repos/${owner}/${repo}/contents/${path}${q}`, github_token);
        if (data.content && data.encoding === "base64") {
          data.decoded_content = atob(data.content);
        }
        result = data;
        break;
      }

      case "github_create_pr": {
        const { owner, repo, title, head, base, body: prBody } = input || {};
        if (!owner || !repo || !title || !head || !base) {
          return json({ error: "owner, repo, title, head, base required" }, 400);
        }
        result = await githubFetch(`/repos/${owner}/${repo}/pulls`, github_token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, head, base, body: prBody || "" }),
        });
        break;
      }

      case "github_list_issues": {
        const { owner, repo, state } = input || {};
        if (!owner || !repo) return json({ error: "owner, repo required" }, 400);
        const q = state ? `?state=${state}` : "";
        result = await githubFetch(`/repos/${owner}/${repo}/issues${q}`, github_token);
        break;
      }

      case "github_create_issue": {
        const { owner, repo, title, body: issueBody, labels } = input || {};
        if (!owner || !repo || !title) return json({ error: "owner, repo, title required" }, 400);
        result = await githubFetch(`/repos/${owner}/${repo}/issues`, github_token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body: issueBody || "", labels: labels || [] }),
        });
        break;
      }

      case "github_list_branches": {
        const { owner, repo } = input || {};
        if (!owner || !repo) return json({ error: "owner, repo required" }, 400);
        result = await githubFetch(`/repos/${owner}/${repo}/branches`, github_token);
        break;
      }

      case "github_get_repo": {
        const { owner, repo } = input || {};
        if (!owner || !repo) return json({ error: "owner, repo required" }, 400);
        result = await githubFetch(`/repos/${owner}/${repo}`, github_token);
        break;
      }

      case "github_create_repo": {
        const { name, description, private: isPrivate, auto_init } = input || {};
        if (!name) return json({ error: "name required" }, 400);
        result = await githubFetch(`/user/repos`, github_token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: description || "", private: isPrivate ?? true, auto_init: auto_init ?? true }),
        });
        break;
      }

      case "github_list_commits": {
        const { owner, repo, sha, per_page } = input || {};
        if (!owner || !repo) return json({ error: "owner, repo required" }, 400);
        const params = new URLSearchParams();
        if (sha) params.set("sha", sha);
        params.set("per_page", String(per_page || 10));
        result = await githubFetch(`/repos/${owner}/${repo}/commits?${params}`, github_token);
        break;
      }

      case "github_push_file": {
        const { owner, repo, path, content, message, branch, sha: fileSha } = input || {};
        if (!owner || !repo || !path || content === undefined || !message) {
          return json({ error: "owner, repo, path, content, message required" }, 400);
        }
        const pushBody: Record<string, unknown> = {
          message,
          content: btoa(unescape(encodeURIComponent(content))),
        };
        if (branch) pushBody.branch = branch;
        if (fileSha) pushBody.sha = fileSha;
        result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, github_token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pushBody),
        });
        break;
      }

      case "github_delete_file": {
        const { owner, repo, path, message, sha: delSha, branch: delBranch } = input || {};
        if (!owner || !repo || !path || !message || !delSha) {
          return json({ error: "owner, repo, path, message, sha required" }, 400);
        }
        const delBody: Record<string, unknown> = { message, sha: delSha };
        if (delBranch) delBody.branch = delBranch;
        result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, github_token, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(delBody),
        });
        break;
      }

      case "github_get_user": {
        result = await githubFetch(`/user`, github_token);
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are "Started Code (Web IDE)" — an agentic coding assistant operating inside a project workspace.

MISSION
Ship correct, minimal, high-quality changes. Prefer small, verifiable edits. Always verify by running tests/linters/builds when available.

OPERATING LOOP (repeat as needed)
1) Gather context: inspect relevant files with Read/Grep/Glob, inspect git status, inspect last run logs.
2) Take action: propose edits as a unified diff patch; use tooling to apply edits if allowed.
3) Verify: run the most relevant command(s) (tests, build, lint). If it fails, iterate.

DEFAULT BEHAVIOR
- Be decisive and practical. Don't ask questions unless blocked by missing requirements.
- Never dump huge code blocks when a patch will do.
- Prefer editing existing files over creating new ones.
- Keep changes localized and consistent with repo conventions.

PATCH-FIRST OUTPUT FORMAT (required)
When you intend to change code, respond in this structure:

A) Plan (max 5 bullets)
B) Patch (unified diff in a fenced code block marked diff)
C) Commands to run (fenced code block)
D) Notes (only if needed; keep short)

Example:

Plan:
- …

Patch:
\`\`\`diff
--- a/path/file.ts
+++ b/path/file.ts
@@ -1,3 +1,5 @@
...
\`\`\`

Commands:
\`\`\`
npm test
\`\`\`

DONE CRITERIA
You are done when:
- The user's request is satisfied
- Changes are consistent with repo style
- Verification commands pass OR you clearly explain what failed and what to do next`;

// ─── Quota check helper ───
async function checkQuota(userId: string, serviceClient: ReturnType<typeof createClient>): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const { data: ledger } = await serviceClient
      .from("api_usage_ledger")
      .select("model_tokens, plan_key")
      .eq("owner_id", userId)
      .gte("period_start", periodStart)
      .lte("period_end", periodEnd)
      .maybeSingle();

    if (!ledger) return { allowed: true }; // No ledger = no tracking yet

    const { data: plan } = await serviceClient
      .from("billing_plans")
      .select("included_tokens")
      .eq("key", ledger.plan_key)
      .maybeSingle();

    if (plan && ledger.model_tokens >= plan.included_tokens) {
      return { allowed: false, reason: "Token quota exceeded for this billing period. Please upgrade your plan." };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // Fail open on quota check errors
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context, project_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ─── Auth check ───
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    // ─── Quota check ───
    if (userId) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const quota = await checkQuota(userId, serviceClient);
      if (!quota.allowed) {
        return new Response(
          JSON.stringify({ error: quota.reason }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Build messages ───
    const systemMessages = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (context && typeof context === "string" && context.trim()) {
      systemMessages.push({
        role: "system",
        content: `Project context:\n${context}`,
      });
    }

    const allMessages = [...systemMessages, ...messages];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: allMessages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Increment token usage (best effort, async) ───
    if (userId) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      // Estimate tokens from message lengths (rough: 1 token ≈ 4 chars)
      const totalChars = allMessages.reduce((sum: number, m: { content: string }) => sum + (m.content?.length || 0), 0);
      const estimatedTokens = Math.ceil(totalChars / 4);

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

      serviceClient.rpc("increment_usage", {
        _owner_id: userId,
        _period_start: periodStart,
        _period_end: periodEnd,
        _tokens: estimatedTokens,
      }).then(() => {}).catch(() => {});
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("started function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

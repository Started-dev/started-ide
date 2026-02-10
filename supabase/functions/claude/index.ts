import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build messages array with system prompt and context
    const systemMessages = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Inject project context if provided
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

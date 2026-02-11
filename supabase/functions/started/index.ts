import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── System Prompts ───
const STANDARD_SYSTEM_PROMPT = `You are "Started Code (Web IDE)" — an agentic coding assistant operating inside a project workspace.

MISSION
Ship correct, minimal, high-quality changes. Prefer small, verifiable edits.

CONTEXT
- Project files and their contents are provided in context below. Do NOT run shell commands to inspect the file system (no ls, find, cat, etc.).
- Use the provided file tree and file contents to understand the project structure.

OUTPUT FORMAT (required)
A) Plan (max 5 bullets)
B) Code changes:
   - For MODIFYING existing files: use unified diff patches in a fenced \`\`\`diff block.
   - For CREATING new files: use fenced code blocks with the file path header: \`\`\`lang path/to/file.ext
C) Cmd (suggested verification commands — these are NOT auto-executed, they are suggestions for the user)
D) Notes (only if needed; keep short)

DEFAULT BEHAVIOR
- Be decisive and practical. Don't ask questions unless blocked by missing requirements.
- Prefer patches for existing files; use full file blocks only for new files.
- Keep changes localized and consistent with repo conventions.
- Focus on producing actionable diffs and file blocks directly — never ask to "inspect" or "run ls".

DONE CRITERIA
You are done when the user's request is satisfied and changes are consistent with repo style.`;

const STARTED_AI_SYSTEM_PROMPT = `You are StartedAI, the native coding agent for Started.dev — a cloud IDE for software engineers.

CONTEXT: Project files are provided. Do NOT run shell commands to inspect files. Act directly on the provided context.

RULES (strict):
- Fewest tokens possible. No filler, no pleasantries, no restating the question.
- Plan: max 3 bullets.
- For EXISTING files: patches only (unified diff).
- For NEW files: full file in a fenced block with path header: \`\`\`lang path/to/file.ext
- Notes: 1 sentence max. Omit if obvious.
- If the answer is short, give it directly. No wrapping.
- Never apologize or hedge. Be direct.
- Never ask to run ls, cat, find, or any inspection command. You have the files.

FORMAT (when changing code):
Plan:
- …

Patch (for existing files):
\`\`\`diff
--- a/path
+++ b/path
@@ …
\`\`\`

New file (for new files):
\`\`\`lang path/to/new-file.ext
<full file content>
\`\`\`

Cmd (suggestions only, not auto-executed):
\`\`\`
<verify command>
\`\`\`

DONE when: request fulfilled, repo-consistent, or failure explained in ≤1 sentence.`;

// ─── Model Cost Multipliers (for billing) ───
const MODEL_MULTIPLIERS: Record<string, number> = {
  "started/started-ai": 0.5,
  "google/gemini-3-flash-preview": 1,
  "google/gemini-2.5-flash": 1,
  "google/gemini-2.5-flash-lite": 0.5,
  "google/gemini-2.5-pro": 2,
  "google/gemini-3-pro-preview": 2,
  "openai/gpt-5-mini": 1.5,
  "openai/gpt-5-nano": 0.75,
  "openai/gpt-5": 3,
  "openai/gpt-5.2": 3.5,
  "anthropic/claude-3-5-haiku-latest": 2,
  "anthropic/claude-sonnet-4": 4,
  "anthropic/claude-opus-4": 6,
};

// ─── RPM Limits by plan tier and model class ───
const RPM_LIMITS: Record<string, { started: number; gateway: number; anthropic: number }> = {
  free:    { started: 10, gateway: 5,  anthropic: 2  },
  builder: { started: 30, gateway: 20, anthropic: 10 },
  pro:     { started: 60, gateway: 40, anthropic: 25 },
  studio:  { started: 120, gateway: 80, anthropic: 50 },
};

function getModelClass(model: string): "started" | "anthropic" | "gateway" {
  if (model === "started/started-ai") return "started";
  if (model.startsWith("anthropic/")) return "anthropic";
  return "gateway";
}

function resolveModel(model: string): string {
  if (model === "started/started-ai") return "google/gemini-3-pro-preview";
  return model;
}

function getSystemPrompt(model: string): string {
  if (model === "started/started-ai") return STARTED_AI_SYSTEM_PROMPT;
  return STANDARD_SYSTEM_PROMPT;
}

// ─── Quota check ───
async function checkQuota(userId: string, serviceClient: ReturnType<typeof createClient>): Promise<{ allowed: boolean; reason?: string; planKey?: string }> {
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

    const planKey = ledger?.plan_key || "free";

    if (!ledger) return { allowed: true, planKey };

    const { data: plan } = await serviceClient
      .from("billing_plans")
      .select("included_tokens")
      .eq("key", planKey)
      .maybeSingle();

    if (plan && ledger.model_tokens >= plan.included_tokens) {
      return { allowed: false, reason: "Token quota exceeded for this billing period. Please upgrade your plan.", planKey };
    }
    return { allowed: true, planKey };
  } catch {
    return { allowed: true, planKey: "free" };
  }
}

// ─── Anthropic SSE → OpenAI SSE translator ───
function streamAnthropicAsOpenAI(anthropicResponse: Response): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = anthropicResponse.body!.getReader();

  return new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                const openAIChunk = {
                  choices: [{ delta: { content: event.delta.text }, index: 0, finish_reason: null }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
              }

              if (event.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
        // Final DONE if not already sent
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        console.error("Anthropic stream error:", e);
      }
      controller.close();
    },
  });
}

// ─── Call Anthropic API directly ───
async function callAnthropic(
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  mcpToolsPrompt: string | null,
  contextPrompt: string | null
): Promise<Response> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured. Please add your Anthropic Enterprise API key.");

  // Anthropic model ID: strip "anthropic/" prefix
  const anthropicModel = model.replace("anthropic/", "");

  // Build system prompt with extras
  let fullSystem = systemPrompt;
  if (contextPrompt) fullSystem += `\n\n${contextPrompt}`;
  if (mcpToolsPrompt) fullSystem += `\n\n${mcpToolsPrompt}`;

  // Convert messages: filter out system messages (Anthropic uses separate system field)
  const anthropicMessages = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 8192,
      system: fullSystem,
      messages: anthropicMessages,
      stream: true,
    }),
  });

  return response;
}

// ─── Call Lovable Gateway ───
async function callGateway(
  model: string,
  allMessages: Array<{ role: string; content: string }>
): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: allMessages,
      stream: true,
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context, project_id, model, mcp_tools } = await req.json();
    const selectedModel = model || "started/started-ai";

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

    // ─── Quota + plan check ───
    let planKey = "free";
    if (userId) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const quota = await checkQuota(userId, serviceClient);
      planKey = quota.planKey || "free";
      if (!quota.allowed) {
        return new Response(
          JSON.stringify({ error: quota.reason }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Build system prompt ───
    const systemPrompt = getSystemPrompt(selectedModel);

    // ─── Context & MCP tool prompts ───
    let contextPrompt: string | null = null;
    if (context && typeof context === "string" && context.trim()) {
      contextPrompt = `Project context:\n${context}`;
    }

    let mcpToolsPrompt: string | null = null;
    if (mcp_tools && Array.isArray(mcp_tools) && mcp_tools.length > 0) {
      const toolList = mcp_tools.map((t: { server: string; name: string; description: string }) =>
        `- [${t.server}] ${t.name}: ${t.description}`
      ).join("\n");
      mcpToolsPrompt = `Available MCP Tools:\n${toolList}\n\nYou can reference these tools in your responses.`;
    }

    // ─── Route by provider ───
    const modelClass = getModelClass(selectedModel);
    let response: Response;

    if (modelClass === "anthropic") {
      // Direct Anthropic API call
      response = await callAnthropic(selectedModel, systemPrompt, messages, mcpToolsPrompt, contextPrompt);

      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic API error:", response.status, errText);
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Anthropic rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Anthropic API error", detail: errText.slice(0, 200) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Translate Anthropic SSE → OpenAI-compatible SSE
      const translatedStream = streamAnthropicAsOpenAI(response);

      // Track usage (best effort)
      if (userId) {
        trackUsage(userId, selectedModel, messages);
      }

      return new Response(translatedStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    } else {
      // Lovable Gateway (StartedAI resolved to gemini-3-pro, or passthrough)
      const resolvedModel = resolveModel(selectedModel);
      const allMessages = [
        { role: "system", content: systemPrompt },
        ...(contextPrompt ? [{ role: "system", content: contextPrompt }] : []),
        ...(mcpToolsPrompt ? [{ role: "system", content: mcpToolsPrompt }] : []),
        ...messages,
      ];

      response = await callGateway(resolvedModel, allMessages);

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

      // Track usage (best effort)
      if (userId) {
        trackUsage(userId, selectedModel, messages);
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }
  } catch (e) {
    console.error("started function error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Best-effort usage tracking with cost multiplier ───
function trackUsage(userId: string, model: string, messages: Array<{ role?: string; content?: string }>) {
  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const rawTokens = Math.ceil(totalChars / 4);
    const multiplier = MODEL_MULTIPLIERS[model] || 1;
    const billedTokens = Math.ceil(rawTokens * multiplier);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    serviceClient.rpc("increment_usage", {
      _owner_id: userId,
      _period_start: periodStart,
      _period_end: periodEnd,
      _tokens: billedTokens,
    }).then(() => {}).catch(() => {});
  } catch {
    // fail silently
  }
}

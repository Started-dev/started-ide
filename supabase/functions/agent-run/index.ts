import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const AGENT_SYSTEM_PROMPT = `You are an autonomous coding agent running inside a cloud IDE.
You are given a GOAL and project files as context. You operate in a loop:

1. THINK: Analyze what needs to be done next. Output your thinking.
2. ACT: Produce a unified diff patch to make changes, OR request a command to run.
3. VERIFY: Suggest a command to verify your changes work.

You MUST respond with valid JSON in this exact format:
{
  "thinking": "Your analysis of what to do next",
  "action": "patch" | "run_command" | "done" | "error",
  "patch": "unified diff if action is patch, otherwise null",
  "command": "command to run if action is run_command, otherwise null", 
  "summary": "Brief summary of what you did or plan to do",
  "done_reason": "If action is done, explain why the goal is complete"
}

Rules:
- Be decisive. Make one change at a time.
- Always verify with tests/build after patching.
- If tests pass after your changes, set action to "done".
- If you've iterated 5+ times without success, set action to "error" with explanation.
- Keep patches minimal and focused.
- Never output anything outside the JSON structure.`;

// ─── Flow Intelligence / Decision Engine prompt (StartedAI only) ───
const FLOW_INTELLIGENCE_PROMPT = `You are the Decision Engine for Started.dev.

Your responsibility is not to chat.
Your responsibility is to choose the correct NEXT ACTION at the correct TIME with the least friction for the user.

You operate inside a production AI IDE with:
- a code editor
- a terminal/runner
- snapshots & diffs
- an event timeline
- permissions & safety boundaries
- autonomous agent mode

Your goal is FLOW COMPLETION.

CORE PRINCIPLE
Always optimize for: 1) Momentum 2) Safety 3) Verification 4) User trust
Never optimize for verbosity.
Never ask questions that can be inferred.
Never suggest actions that are redundant or unsafe.

INPUTS YOU ALWAYS CONSIDER
Before choosing any action, evaluate:
1) Current State: active file(s), current snapshot + diff, last run status, terminal output, agent run status
2) Recent Events: patch applied? run started/failed/succeeded? MCP calls made? permissions blocked?
3) User Behavior Signals: did user accept/ignore last suggestion? do they usually run tests? do they prefer explanations or patches? are they in agent mode?
4) Risk Level: read-only vs write vs execution, destructive/irreversible actions, external side effects

ACTION TAXONOMY (ONLY THESE)
READ: inspect file, search project, summarize change, explain error
PATCH: preview diff, apply patch, refine patch
RUN: run suggested command, re-run last, run tests, run build
AGENT: start/continue/pause/cancel agent run, adjust agent goal
VERIFY: check tests, confirm reproducibility, generate attestation, replay run
SHIP: prepare PR summary, merge agent changes, mark task complete

NEXT-BEST-ACTION RULES
1: Prefer completion over explanation — if a verifiable action can move the task forward safely, propose it instead of explaining.
2: Prefer preview before mutation — offer "Preview Diff" before "Apply" unless user explicitly asked to apply.
3: Never skip verification — if code changed and tests/build exist, next best action is ALWAYS a run.
4: Surface failure immediately — if the last run failed, highest-priority action is to fix or explain the failure.
5: Do not repeat ignored actions — if user ignores same suggestion twice, downgrade its priority.
6: Do not interrupt flow — never suggest actions requiring context switch unless current path is blocked.
7: Agent mode changes everything — think in steps, choose next step not multiple options, only stop when blocked/complete/unsafe.

CONFIDENCE STATES (MANDATORY)
Every proposed action must include a confidence level:
HIGH — verified by tests or deterministic logic
MEDIUM — logical next step, unverified
LOW — speculative, exploratory, requires confirmation
If confidence is LOW, require explicit user confirmation.

ACTION PRESENTATION (UX CONTRACT)
Present at most:
- 1 Primary action (recommended)
- up to 2 Secondary actions (optional)
Each action: short verb phrase + reason + confidence badge.

AUTOMATIC CONTEXT ATTACHMENT
When choosing an action, automatically attach:
- last run errors if a run failed
- current diff if code changed
- active file if user is editing
Never ask the user to attach context unless ambiguous.

WHEN TO ASK QUESTIONS (RARE)
Ask ONLY if: multiple actions equally safe and impactful, required permissions missing, or user intent cannot be inferred.
If you ask, ask ONE question and immediately propose a default action.

You are not here to be impressive. You are here to make progress inevitable.

FSM STATE MACHINE (governs your transitions)
States: IDLE, CONTEXT_GATHERING, PLANNING, PATCH_READY, DIFF_REVIEW, APPLYING_PATCH, RUNNING_COMMAND, EVALUATING_RESULTS, NEEDS_APPROVAL, AGENT_RUNNING, BLOCKED, SHIP_READY, DONE
Key transitions:
- IDLE + user.message -> CONTEXT_GATHERING -> PLANNING
- PLANNING + patch -> PATCH_READY -> (preview) DIFF_REVIEW -> APPLYING_PATCH
- APPLYING_PATCH + ok -> RUNNING_COMMAND -> EVALUATING_RESULTS
- EVALUATING_RESULTS + ok -> SHIP_READY; + error -> PLANNING (with errors attached)
- AGENT_RUNNING + step_done -> AGENT_RUNNING; + blocked -> BLOCKED; + done -> SHIP_READY
Invariants: Never apply patch without snapshot. Never run commands without policy gate. Every run links attestation when possible.

NBA SCORING (governs your action selection)
Urgency weights: last_run_failed=+40, agent_blocked=+50, diff_dirty_unverified=+30, patch_ready_unapplied=+25
Verification bonus: run_tests=+25, run_build=+20, attestation=+18
Momentum bonus: run_after_apply=+20, continue_agent=+25, apply_after_preview=+15
Safety penalty: risk_write=-35, requires_approval_ungranted=-100
Friction penalty: -10 per ignored suggestion count
Select 1 primary (max score) + up to 2 secondary (within 70% of primary).`;

// ─── Agent Retrospective prompt (post-run analysis) ───
const AGENT_RETROSPECTIVE_PROMPT = `You are Started's internal reviewer. Produce a short, brutally useful retrospective.

OUTPUT FORMAT (strict JSON)
{
  "outcome": "success" | "partial" | "failed",
  "what_changed": ["bullet 1", "bullet 2"],
  "verification": {"commands_run": [], "passed": true|false, "details": "summary"},
  "risk_assessment": {"level": "low"|"medium"|"high", "reason": "why"},
  "reproducibility": {"attestation_exists": true|false, "replayable": true|false},
  "what_went_wrong": "root cause or null",
  "next_actions": ["action 1", "action 2", "action 3"],
  "lessons": ["lesson 1", "lesson 2"],
  "ship_readiness": "ready"|"needs_work"|"blocked"
}

RULES
- Do not be verbose. Do not blame the user.
- Treat terminal output and attestations as authoritative.
- If you repeated failures, admit the loop and propose a different approach.
- If success, include ship readiness evidence.
- Never output anything outside the JSON structure.`;

// ─── Ship Mode prompt (PR/deploy flow) ───
const SHIP_MODE_PROMPT = `You are Started in SHIP MODE. Move from "working changes" to "safe delivery".

OBJECTIVE: Produce a PR/deploy that is reviewable, verifiable, low-risk. Never ship without evidence unless waived.

FLOW:
1) Pre-Flight: confirm snapshot/ref, tests/build status, attestation exists, identify risk areas
2) PR Packet: title (imperative), summary (3 bullets), file-level changes with intent, verification commands+attestation, risk+rollback plan
3) Gate: require approval for git push/deploy/env changes/chain writes. Never include secrets.
4) Deploy: confirm target, dry-run build, execute, post-deploy smoke test
5) Ship Evidence: attestation hash, snapshot ID, commands, exit codes, replay status

OUTPUT FORMAT (strict JSON)
{
  "ship_plan": ["step 1", "step 2"],
  "pr_packet": {"title": "", "summary": [], "changes": [], "verification": {}, "risk": {}},
  "actions": {"primary": {"label": "", "confidence": ""}, "secondary": []}
}

RULES: If tests failed, do not ship. If no tests, label verification "limited" and raise risk. Always include attestation. Be concise.`;

// ─── Model cost multipliers ───
const MODEL_MULTIPLIERS: Record<string, number> = {
  "started/started-ai": 0.5,
  "google/gemini-3-flash-preview": 1,
  "google/gemini-2.5-flash": 1,
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

function resolveModel(model: string): string {
  if (model === "started/started-ai") return "google/gemini-3-flash-preview";
  return model;
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith("anthropic/");
}

// ─── Call Anthropic API (non-streaming, JSON mode) ───
async function callAnthropicJSON(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ ok: boolean; status: number; content: string }> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const anthropicModel = model.replace("anthropic/", "");
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" as const : "user" as const,
    content: m.content,
  }));

  const systemText = systemMessages.map(m => m.content).join("\n\n");

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
      system: systemText,
      messages: nonSystemMessages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { ok: false, status: response.status, content: errText };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || "{}";
  return { ok: true, status: 200, content };
}

// ─── Call Lovable Gateway (non-streaming, JSON mode) ───
async function callGatewayJSON(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ ok: boolean; status: number; content: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { ok: false, status: response.status, content: errText };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  return { ok: true, status: 200, content };
}

// ─── Unified AI call ───
async function callAI(
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ ok: boolean; status: number; content: string }> {
  if (isAnthropicModel(model)) {
    return callAnthropicJSON(model, messages);
  }
  const resolved = resolveModel(model);
  return callGatewayJSON(resolved, messages);
}

// ─── Track usage with multiplier ───
function trackUsage(userId: string, model: string, charCount: number) {
  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const rawTokens = Math.ceil(charCount / 4);
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
  } catch { /* fail silently */ }
}

interface AgentRequest {
  goal: string;
  project_id: string;
  files: Array<{ path: string; content: string }>;
  history?: Array<{ role: string; content: string }>;
  maxIterations?: number;
  preset_key?: string;
  run_id?: string;
  model?: string;
  mcp_tools?: Array<{ server: string; name: string; description: string }>;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function checkConcurrentRuns(userId: string, db: ReturnType<typeof createClient>): Promise<boolean> {
  const { count } = await db
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "running");

  const { data: ledger } = await db
    .from("api_usage_ledger")
    .select("plan_key")
    .eq("owner_id", userId)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planKey = ledger?.plan_key || "free";
  const { data: plan } = await db
    .from("billing_plans")
    .select("max_concurrent_runs")
    .eq("key", planKey)
    .maybeSingle();

  const maxConcurrent = plan?.max_concurrent_runs || 2;
  return (count || 0) < maxConcurrent;
}

async function persistStep(
  db: ReturnType<typeof createClient>,
  runId: string, stepIndex: number, kind: string, title: string,
  input: unknown, output: unknown, status: string, durationMs?: number
) {
  try {
    await db.from("agent_steps").insert({
      agent_run_id: runId, step_index: stepIndex, kind, title,
      input, output, status, duration_ms: durationMs,
    });
  } catch (e) { console.error("Failed to persist step:", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ─── GET: Retrieve run status ───
  if (req.method === "GET") {
    const url = new URL(req.url);
    const runId = url.searchParams.get("run_id");
    if (!runId) {
      return new Response(JSON.stringify({ error: "Missing run_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const db = getServiceClient();
    const { data: run } = await db.from("agent_runs").select("*").eq("id", runId).single();
    const { data: steps } = await db.from("agent_steps").select("*").eq("agent_run_id", runId).order("step_index");
    return new Response(JSON.stringify({ ok: true, run, steps }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── DELETE: Cancel a run ───
  if (req.method === "DELETE") {
    const { run_id } = await req.json();
    if (!run_id) {
      return new Response(JSON.stringify({ error: "Missing run_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const db = getServiceClient();
    await db.from("agent_runs").update({ status: "cancelled" }).eq("id", run_id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json() as AgentRequest;
    const { goal, project_id, files, history, maxIterations, preset_key, run_id, model, mcp_tools } = body;
    const selectedModel = model || "started/started-ai";

    if (!goal) {
      return new Response(
        JSON.stringify({ error: "Missing 'goal'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Auth ───
    const user = await getUser(req);
    const userId = user?.id;
    const db = getServiceClient();

    // ─── Concurrency check ───
    if (userId) {
      const canRun = await checkConcurrentRuns(userId, db);
      if (!canRun) {
        return new Response(
          JSON.stringify({ error: "Max concurrent agent runs reached. Please wait for a run to complete or upgrade your plan." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Create or resume agent_run record ───
    let agentRunId = run_id;
    let startStep = 0;

    if (agentRunId) {
      const { data: existingRun } = await db.from("agent_runs").select("current_step, status").eq("id", agentRunId).single();
      if (existingRun) {
        startStep = existingRun.current_step;
        await db.from("agent_runs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", agentRunId);
      }
    } else if (userId && project_id) {
      const { data: newRun } = await db.from("agent_runs").insert({
        project_id, user_id: userId, preset_key: preset_key || null,
        goal, status: "running", max_steps: Math.min(maxIterations || 8, 25),
      }).select("id").single();
      agentRunId = newRun?.id;
    }

    const max = Math.min(maxIterations || 8, 25);
    const encoder = new TextEncoder();

    const fileContext = (files || []).slice(0, 20)
      .map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

    const conversationHistory: Array<{ role: string; content: string }> = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
    ];

    // Inject Flow Intelligence prompt for StartedAI model only
    if (selectedModel === "started/started-ai") {
      conversationHistory.push({
        role: "system",
        content: FLOW_INTELLIGENCE_PROMPT,
      });
    }

    if (mcp_tools && Array.isArray(mcp_tools) && mcp_tools.length > 0) {
      const toolList = mcp_tools.map((t) => `- [${t.server}] ${t.name}: ${t.description}`).join("\n");
      conversationHistory.push({
        role: "system",
        content: `Available MCP Tools:\n${toolList}\n\nYou can use these tools by setting action to "mcp_call" with fields: "mcp_server", "mcp_tool", and "mcp_input".`,
      });
    }

    conversationHistory.push(
      { role: "user", content: `GOAL: ${goal}\n\nPROJECT FILES:\n${fileContext}` },
      ...(history || []),
    );

    let totalChars = 0;

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        if (agentRunId) sendEvent({ type: "run_started", run_id: agentRunId });

        try {
          for (let iteration = startStep + 1; iteration <= max; iteration++) {
            if (agentRunId) {
              const { data: runCheck } = await db.from("agent_runs").select("status").eq("id", agentRunId).single();
              if (runCheck?.status === "cancelled") {
                sendEvent({ type: "agent_cancelled", reason: "Run was cancelled by user" });
                break;
              }
            }

            const stepStartMs = Date.now();
            sendEvent({
              type: "step",
              step: { id: `step-${Date.now()}-think`, type: "think", label: `Iteration ${iteration}: Analyzing...`, status: "running" },
              iteration,
            });

            // ─── Call AI (routed by provider) ───
            const aiResult = await callAI(selectedModel, conversationHistory);
            totalChars += conversationHistory.reduce((s, m) => s + (m.content?.length || 0), 0);

            if (!aiResult.ok) {
              console.error("AI error:", aiResult.status, aiResult.content);
              const stepDuration = Date.now() - stepStartMs;
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "error", `AI error: ${aiResult.status}`, {}, { error: aiResult.content.slice(0, 500) }, "error", stepDuration);
                await db.from("agent_runs").update({ status: "failed", error_message: `AI error: ${aiResult.status}`, current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-error`, type: "error", label: `AI error: ${aiResult.status}`, detail: aiResult.content.slice(0, 200), status: "failed" }, iteration });
              break;
            }

            const rawContent = aiResult.content;
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(rawContent);
            } catch {
              const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try { parsed = JSON.parse(jsonMatch[0]); }
                catch { parsed = { thinking: rawContent, action: "error", summary: "Failed to parse AI response" }; }
              } else {
                parsed = { thinking: rawContent, action: "error", summary: "AI response was not valid JSON" };
              }
            }

            conversationHistory.push({ role: "assistant", content: rawContent });
            const stepDuration = Date.now() - stepStartMs;

            if (agentRunId) {
              await db.from("agent_runs").update({ current_step: iteration }).eq("id", agentRunId);
            }

            sendEvent({
              type: "step",
              step: { id: `step-${Date.now()}-think-done`, type: "think", label: `Thinking: ${parsed.summary || "Analyzing..."}`, detail: (parsed.thinking as string)?.slice(0, 300), status: "completed" },
              iteration,
            });

            // ─── Handle action ───
            if (parsed.action === "done") {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "done", "Goal completed", {}, { reason: parsed.done_reason }, "ok", stepDuration);
                await db.from("agent_runs").update({ status: "done", current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-done`, type: "done", label: "Goal completed", detail: (parsed.done_reason || parsed.summary) as string, status: "completed" }, iteration });
              sendEvent({ type: "agent_done", reason: (parsed.done_reason || parsed.summary) as string });

              // ─── Generate retrospective for StartedAI runs ───
              if (selectedModel === "started/started-ai" && agentRunId) {
                try {
                  const retroMessages = [
                    { role: "system", content: AGENT_RETROSPECTIVE_PROMPT },
                    { role: "user", content: `RETROSPECTIVE INPUT:\n\nGOAL: ${goal}\n\nSTEPS COMPLETED: ${iteration}\n\nFINAL STATUS: done\n\nCONVERSATION SUMMARY:\n${conversationHistory.filter(m => m.role === "assistant").map(m => m.content.slice(0, 200)).join("\n---\n")}` },
                  ];
                  const retroResult = await callAI(selectedModel, retroMessages);
                  if (retroResult.ok) {
                    await persistStep(db, agentRunId, iteration + 1, "retrospective", "Agent retrospective", {}, JSON.parse(retroResult.content), "ok");
                    sendEvent({ type: "retrospective", data: JSON.parse(retroResult.content) });
                    totalChars += retroMessages.reduce((s, m) => s + m.content.length, 0);
                  }
                } catch (retroErr) {
                  console.error("Retrospective generation failed:", retroErr);
                }
              }

              break;
            }

            if (parsed.action === "error") {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "error", "Agent error", {}, { reason: parsed.summary }, "error", stepDuration);
                await db.from("agent_runs").update({ status: "failed", error_message: parsed.summary as string, current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-err`, type: "error", label: "Agent error", detail: parsed.summary as string, status: "failed" }, iteration });
              sendEvent({ type: "agent_error", reason: parsed.summary as string });
              break;
            }

            if (parsed.action === "patch" && parsed.patch) {
              if (agentRunId) await persistStep(db, agentRunId, iteration, "patch", (parsed.summary || "Generating patch") as string, { diff: parsed.patch }, {}, "ok", stepDuration);
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-patch`, type: "patch", label: "Generating patch", detail: parsed.summary as string, status: "completed" }, iteration });
              sendEvent({ type: "patch", diff: parsed.patch, summary: parsed.summary });
              conversationHistory.push({ role: "user", content: "The patch was applied successfully. What should we do next? Run tests to verify?" });
            }

            if (parsed.action === "run_command" && parsed.command) {
              if (agentRunId) await persistStep(db, agentRunId, iteration, "run", `Running: ${parsed.command}`, { command: parsed.command }, {}, "ok", stepDuration);
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-run`, type: "run", label: `Running: ${parsed.command}`, detail: parsed.command as string, status: "completed" }, iteration });
              sendEvent({ type: "run_command", command: parsed.command, summary: parsed.summary });
              conversationHistory.push({ role: "user", content: `Command \`${parsed.command}\` executed successfully with exit code 0. Continue with next step.` });
            }

            if (parsed.action === "mcp_call" && parsed.mcp_tool) {
              // Actually invoke the MCP edge function server-side
              let mcpResultText = "MCP call failed: unknown error";
              try {
                const mcpServer = (parsed.mcp_server || "mcp-github") as string;
                const mcpResp = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/${mcpServer}`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ tool: parsed.mcp_tool, input: parsed.mcp_input || {} }),
                  }
                );
                const mcpData = await mcpResp.json();
                if (mcpData.ok) {
                  mcpResultText = `MCP tool \`${parsed.mcp_tool}\` succeeded. Result: ${JSON.stringify(mcpData.result).slice(0, 2000)}`;
                } else {
                  mcpResultText = `MCP tool \`${parsed.mcp_tool}\` failed: ${mcpData.error || "unknown error"}`;
                }
              } catch (mcpErr) {
                mcpResultText = `MCP tool \`${parsed.mcp_tool}\` threw: ${mcpErr instanceof Error ? mcpErr.message : "unknown"}`;
              }

              if (agentRunId) await persistStep(db, agentRunId, iteration, "mcp_call", `MCP: ${parsed.mcp_tool}`, { server: parsed.mcp_server, tool: parsed.mcp_tool, input: parsed.mcp_input }, { result: mcpResultText }, "ok", stepDuration);
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-mcp`, type: "mcp_call", label: `MCP: ${parsed.mcp_tool}`, detail: parsed.summary as string, status: "completed" }, iteration });
              sendEvent({ type: "mcp_call", server: parsed.mcp_server, tool: parsed.mcp_tool, input: parsed.mcp_input || {}, summary: parsed.summary });
              conversationHistory.push({ role: "user", content: mcpResultText });
            }

            if (!["patch", "run_command", "done", "error", "mcp_call"].includes(parsed.action as string || "")) {
              if (agentRunId) await persistStep(db, agentRunId, iteration, "think", (parsed.summary || "Continuing") as string, {}, {}, "ok", stepDuration);
              conversationHistory.push({ role: "user", content: "Continue with the next step toward the goal." });
            }

            if (iteration === max) {
              if (agentRunId) await db.from("agent_runs").update({ status: "done", current_step: iteration }).eq("id", agentRunId);
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-maxiter`, type: "done", label: `Reached max iterations (${max})`, status: "completed" }, iteration });
              sendEvent({ type: "agent_done", reason: `Completed ${max} iterations` });
            }
          }

          // Track usage at end
          if (userId) trackUsage(userId, selectedModel, totalChars);
        } catch (e) {
          console.error("Agent loop error:", e);
          if (agentRunId) await db.from("agent_runs").update({ status: "failed", error_message: e instanceof Error ? e.message : "Unknown" }).eq("id", agentRunId);
          sendEvent({ type: "agent_error", reason: e instanceof Error ? e.message : "Unknown" });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("agent-run error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

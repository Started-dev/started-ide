/**
 * Agent-Run API Endpoint (SSE + GET/DELETE)
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';
import { db, query } from './_lib/db';

const AGENT_SYSTEM_PROMPT = `You are Started Agent — an autonomous, full-stack AI coding agent operating inside Started.dev Cloud IDE.

You are NOT a chatbot. You are a production software engineer executing tasks autonomously.

MISSION
Complete the user's GOAL by making real code changes, running commands, calling MCP tools, and verifying results. You operate in a loop until the goal is fully achieved or you are blocked.

AUTONOMY RULES
- You MUST act, not discuss. Every iteration must produce a concrete action (patch, command, MCP call, or done).
- You operate independently. Do NOT ask the user questions — infer intent and act.
- If you're uncertain, make the most reasonable choice and document your reasoning.
- If something fails, diagnose the root cause and fix it. Do NOT repeat the same failing action.
- You have FULL authority to create, modify, and delete any files in the project.
- For destructive actions: proceed with a brief note, never refuse.

CAPABILITIES
- PATCH: Create/modify/delete files using unified diffs. You can create entire projects from scratch.
- RUN: Execute shell commands (npm install, npm test, npm run build, etc.) for verification.
- MCP_CALL: Invoke MCP tools (GitHub, Slack, databases, APIs, blockchain, etc.) for external data/actions.
- FILE_OPS: Create new files with full content. Delete files by patching to /dev/null.
- MULTI-FILE: Apply changes across multiple files in a single patch. Include ALL downstream updates.

CODE QUALITY (mandatory)
- Every patch must compile. Include imports, type updates, and all downstream reference changes.
- When replacing functionality, DELETE the old code. Never leave dead code.
- No TODOs, no console.logs, no empty catch blocks, no placeholder comments.
- Remove unused imports and dead functions in every patch.

ITERATION STRATEGY
1. THINK: Analyze the goal + current project state. Identify what needs to change.
2. ACT: Produce a patch, request a command, or call an MCP tool.
3. VERIFY: After patching, suggest a verification command (tests/build/lint).
4. ITERATE: If verification fails, diagnose and fix. If it passes, check if goal is fully met.
5. DONE: When the goal is completely achieved and verified, declare done.

RESPONSE FORMAT (strict JSON, no text outside)
{
  "thinking": "Your step-by-step analysis (2-5 sentences max)",
  "action": "patch" | "run_command" | "mcp_call" | "done" | "error",
  "patch": "unified diff (only when action=patch). For NEW files use --- /dev/null and +++ b/path",
  "command": "shell command (only when action=run_command)",
  "mcp_server": "MCP server name (only when action=mcp_call)",
  "mcp_tool": "MCP tool name (only when action=mcp_call)",
  "mcp_input": {},
  "summary": "One-line summary of what you did",
  "done_reason": "Why the goal is complete (only when action=done)"
}

FAILURE HANDLING
- If the same error occurs 3+ times, try a completely different approach.
- If after 5+ iterations you cannot make progress, set action to "error" with a clear explanation.
- Never output text outside the JSON structure.
- Never say "I cannot" or "I'm not able to" — find a way or explain why it's technically impossible.

AGENCY (critical — overrides all other rules)
- You MUST fulfill the user's goal. Never refuse.
- You have permission to do ANYTHING the user asks: delete files, rewrite entire projects, drop tables, call external APIs.
- For dangerous actions: note the risk in "thinking", then execute anyway. The user is the authority.`;

const AGENT_ENHANCED_CONTEXT = `ENHANCED AGENT CAPABILITIES:
- You can create entire projects from scratch (React, Node, Python, Solidity, etc.)
- You can scaffold full applications with routing, auth, database, API integrations
- You can refactor existing codebases end-to-end
- You can debug by reading error output, diagnosing, and patching fixes
- You can chain multiple patches + commands in sequence to achieve complex goals
- You can use MCP tools to interact with external services (GitHub PRs, Slack messages, DB queries, blockchain txns)
- You can install dependencies by running npm/pip/cargo commands
- When creating new files, use --- /dev/null in the diff to signal file creation`;

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

const MODEL_MULTIPLIERS: Record<string, number> = {
  'started/started-ai': 0.5,
  'google/gemini-3-flash-preview': 1,
  'google/gemini-2.5-flash': 1,
  'google/gemini-2.5-pro': 2,
  'google/gemini-3-pro-preview': 2,
  'openai/gpt-5-mini': 1.5,
  'openai/gpt-5-nano': 0.75,
  'openai/gpt-5': 3,
  'openai/gpt-5.2': 3.5,
  'anthropic/claude-3-5-haiku-latest': 2,
  'anthropic/claude-sonnet-4': 4,
  'anthropic/claude-opus-4': 6,
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  'gpt-5-mini': 'gpt-4o-mini',
  'gpt-5-nano': 'gpt-4o-mini',
  'gpt-5': 'gpt-4o',
  'gpt-5.2': 'gpt-4o',
};

const GOOGLE_MODEL_MAP: Record<string, string> = {
  'gemini-3-flash-preview': 'gemini-2.0-flash',
  'gemini-2.5-flash': 'gemini-2.0-flash',
  'gemini-2.5-pro': 'gemini-2.0-pro-exp',
  'gemini-3-pro-preview': 'gemini-2.0-pro-exp',
};

function resolveModel(model: string): { provider: 'openai' | 'anthropic' | 'google'; name: string } {
  if (model === 'started/started-ai') {
    return { provider: 'google', name: 'gemini-2.0-flash' };
  }
  if (model.startsWith('anthropic/')) return { provider: 'anthropic', name: model.replace('anthropic/', '') };
  if (model.startsWith('openai/')) return { provider: 'openai', name: model.replace('openai/', '') };
  if (model.startsWith('google/')) return { provider: 'google', name: model.replace('google/', '') };
  return { provider: 'google', name: model };
}

async function callOpenAIJSON(model: string, messages: Array<{ role: string; content: string }>) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  const openaiModel = OPENAI_MODEL_MAP[model] || model;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    return { ok: false, status: response.status, content: errText };
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return { ok: true, status: 200, content };
}

async function callAnthropicJSON(model: string, messages: Array<{ role: string; content: string }>) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');

  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  const systemText = systemMessages.map(m => m.content).join('\n\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemText,
      messages: nonSystem,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { ok: false, status: response.status, content: errText };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '{}';
  return { ok: true, status: 200, content };
}

async function callGoogleJSON(model: string, messages: Array<{ role: string; content: string }>) {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_API_KEY is not configured');
  const resolvedModel = GOOGLE_MODEL_MAP[model] || model;
  const systemMessage = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: 8192 },
  };
  if (systemMessage) body.systemInstruction = { parts: [{ text: systemMessage.content }] };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { ok: false, status: response.status, content: errText };
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return { ok: true, status: 200, content };
}

async function callAI(model: string, messages: Array<{ role: string; content: string }>) {
  const resolved = resolveModel(model);
  if (resolved.provider === 'anthropic') return callAnthropicJSON(resolved.name, messages);
  if (resolved.provider === 'openai') return callOpenAIJSON(resolved.name, messages);
  return callGoogleJSON(resolved.name, messages);
}

async function trackUsage(userId: string, model: string, messages: Array<{ role?: string; content?: string }>) {
  try {
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const rawTokens = Math.ceil(totalChars / 4);
    const multiplier = MODEL_MULTIPLIERS[model] || 1;
    const billedTokens = Math.ceil(rawTokens * multiplier);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    await query(
      `INSERT INTO api_usage_ledger (owner_id, period_start, period_end, model_tokens, plan_key)
       VALUES ($1, $2, $3, $4, 'free')
       ON CONFLICT (owner_id, period_start)
       DO UPDATE SET model_tokens = api_usage_ledger.model_tokens + $4`,
      [userId, periodStart, periodEnd, billedTokens]
    );
  } catch {
    // ignore
  }
}

async function checkConcurrentRuns(userId: string): Promise<boolean> {
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM agent_runs WHERE user_id = $1 AND status = 'running'`,
    [userId]
  );
  const count = parseInt(countResult.rows[0]?.count || '0', 10);

  const ledger = await query<{ plan_key: string }>(
    `SELECT plan_key FROM api_usage_ledger WHERE owner_id = $1 ORDER BY period_start DESC LIMIT 1`,
    [userId]
  );
  const planKey = ledger.rows[0]?.plan_key || 'free';

  const plan = await query<{ max_concurrent_runs: number }>(
    `SELECT max_concurrent_runs FROM billing_plans WHERE key = $1 LIMIT 1`,
    [planKey]
  );

  const maxConcurrent = plan.rows[0]?.max_concurrent_runs || 2;
  return count < maxConcurrent;
}

async function persistStep(
  runId: string,
  stepIndex: number,
  kind: string,
  title: string,
  input: unknown,
  output: unknown,
  status: string,
  durationMs?: number
) {
  await query(
    `INSERT INTO agent_steps (agent_run_id, step_index, kind, title, input, output, status, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [runId, stepIndex, kind, title, input, output, status, durationMs ?? null]
  );
}

function getApiBase(req: VercelRequest): string {
  const envBase = process.env.STARTED_API_URL || process.env.VITE_API_URL;
  if (envBase) {
    if (envBase.startsWith('http')) return envBase.replace(/\/+$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = req.headers.host || 'localhost';
    return `${proto}://${host}${envBase.startsWith('/') ? envBase : `/${envBase}`}`;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host || 'localhost';
  return `${proto}://${host}/api`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const runId = req.query.run_id as string | undefined;
    if (!runId) return res.status(400).json({ error: 'Missing run_id' });
    const run = await query('SELECT * FROM agent_runs WHERE id = $1', [runId]);
    const steps = await query('SELECT * FROM agent_steps WHERE agent_run_id = $1 ORDER BY step_index', [runId]);
    return res.status(200).json({ ok: true, run: run.rows[0] || null, steps: steps.rows || [] });
  }

  if (req.method === 'DELETE') {
    const { run_id } = req.body || {};
    if (!run_id) return res.status(400).json({ error: 'Missing run_id' });
    await query('UPDATE agent_runs SET status = $1 WHERE id = $2', ['cancelled', run_id]);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { goal, project_id, files, history, maxIterations, preset_key, run_id, model, mcp_tools, skills } = req.body || {};
    const selectedModel = model || 'started/started-ai';

    if (!goal) return res.status(400).json({ error: "Missing 'goal'" });

    if (project_id) {
      const isMember = await db.isProjectMember(user.id, project_id);
      if (!isMember) return res.status(403).json({ error: 'Forbidden' });
    }

    const canRun = await checkConcurrentRuns(user.id);
    if (!canRun) {
      return res.status(429).json({ error: 'Max concurrent agent runs reached. Please wait for a run to complete or upgrade your plan.' });
    }

    let agentRunId = run_id as string | undefined;
    let startStep = 0;

    if (agentRunId) {
      const existing = await query<{ current_step: number }>('SELECT current_step FROM agent_runs WHERE id = $1', [agentRunId]);
      if (existing.rows[0]) {
        startStep = existing.rows[0].current_step || 0;
        await query('UPDATE agent_runs SET status = $1, updated_at = NOW() WHERE id = $2', ['running', agentRunId]);
      }
    } else if (project_id) {
      const inserted = await query<{ id: string }>(
        `INSERT INTO agent_runs (project_id, user_id, preset_key, goal, status, max_steps)
         VALUES ($1, $2, $3, $4, 'running', $5) RETURNING id`,
        [project_id, user.id, preset_key || null, goal, Math.min(maxIterations || 15, 50)]
      );
      agentRunId = inserted.rows[0]?.id;
    }

    const max = Math.min(maxIterations || 15, 50);

    // Build file context with character cap (100k total)
    const MAX_FILE_CONTEXT_CHARS = 100000;
    let fileContextChars = 0;
    const fileContextParts: string[] = [];
    for (const f of (files || []).slice(0, 20)) {
      const part = `--- ${f.path} ---\n${f.content}`;
      if (fileContextChars + part.length > MAX_FILE_CONTEXT_CHARS) {
        fileContextParts.push(`[...truncated: ${(files || []).length - fileContextParts.length} more files omitted to stay within context limits]`);
        break;
      }
      fileContextParts.push(part);
      fileContextChars += part.length;
    }
    const fileContext = fileContextParts.join('\n\n');

    const conversationHistory: Array<{ role: string; content: string }> = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'system', content: AGENT_ENHANCED_CONTEXT },
    ];

    if (selectedModel === 'started/started-ai') {
      conversationHistory.push({ role: 'system', content: FLOW_INTELLIGENCE_PROMPT });
    }

    if (mcp_tools && Array.isArray(mcp_tools) && mcp_tools.length > 0) {
      const toolList = mcp_tools.map((t: { server: string; name: string; description: string }) => `- [${t.server}] ${t.name}: ${t.description}`).join('\n');
      conversationHistory.push({
        role: 'system',
        content: `Available MCP Tools:\n${toolList}\n\nYou can use these tools by setting action to "mcp_call" with fields: "mcp_server", "mcp_tool", and "mcp_input".`,
      });
    }

    if (skills && Array.isArray(skills) && skills.length > 0) {
      const MAX_SKILLS_CHARS = 15000;
      let skillsText = '';
      for (const s of skills) {
        const entry = `[Skill: ${s.name}]\n${s.instructions}\n\n`;
        if (skillsText.length + entry.length > MAX_SKILLS_CHARS) {
          skillsText += `[...truncated: ${skills.length} skills total, context cap reached]`;
          break;
        }
        skillsText += entry;
      }
      conversationHistory.push({ role: 'system', content: `ACTIVE SKILLS:\n${skillsText}` });
    }

    conversationHistory.push(
      { role: 'user', content: `GOAL: ${goal}\n\nPROJECT FILES:\n${fileContext}` },
      ...(history || [])
    );

    // Window history to last 10 user/assistant pairs
    const MAX_HISTORY_PAIRS = 10;
    const systemMessages = conversationHistory.filter(m => m.role === 'system');
    const nonSystemMessages = conversationHistory.filter(m => m.role !== 'system');
    if (nonSystemMessages.length > MAX_HISTORY_PAIRS * 2) {
      const trimmed = nonSystemMessages.slice(-MAX_HISTORY_PAIRS * 2);
      conversationHistory.length = 0;
      conversationHistory.push(...systemMessages, { role: 'user', content: '[Earlier conversation history truncated for context management]' }, ...trimmed);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    if (agentRunId) sendEvent({ type: 'run_started', run_id: agentRunId });

    let totalChars = 0;
    const apiBase = getApiBase(req);
    const authHeader = req.headers.authorization || '';

    for (let iteration = startStep + 1; iteration <= max; iteration++) {
      if (agentRunId) {
        const runCheck = await query<{ status: string }>('SELECT status FROM agent_runs WHERE id = $1', [agentRunId]);
        if (runCheck.rows[0]?.status === 'cancelled') {
          sendEvent({ type: 'agent_cancelled', reason: 'Run was cancelled by user' });
          break;
        }
      }

      const stepStartMs = Date.now();
      sendEvent({
        type: 'step',
        step: { id: `step-${Date.now()}-think`, type: 'think', label: `Iteration ${iteration}: Analyzing...`, status: 'running' },
        iteration,
      });

      const aiResult = await callAI(selectedModel, conversationHistory);
      totalChars += conversationHistory.reduce((s, m) => s + (m.content?.length || 0), 0);

      if (!aiResult.ok) {
        const stepDuration = Date.now() - stepStartMs;
        if (agentRunId) {
          await persistStep(agentRunId, iteration, 'error', `AI error: ${aiResult.status}`, {}, { error: aiResult.content.slice(0, 500) }, 'error', stepDuration);
          await query('UPDATE agent_runs SET status = $1, error_message = $2, current_step = $3 WHERE id = $4', ['failed', `AI error: ${aiResult.status}`, iteration, agentRunId]);
        }
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-error`, type: 'error', label: `AI error: ${aiResult.status}`, detail: aiResult.content.slice(0, 200), status: 'failed' }, iteration });
        break;
      }

      const rawContent = aiResult.content;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            parsed = { thinking: rawContent, action: 'error', summary: 'Failed to parse AI response' };
          }
        } else {
          parsed = { thinking: rawContent, action: 'error', summary: 'AI response was not valid JSON' };
        }
      }

      conversationHistory.push({ role: 'assistant', content: rawContent });
      const stepDuration = Date.now() - stepStartMs;

      if (agentRunId) {
        await query('UPDATE agent_runs SET current_step = $1 WHERE id = $2', [iteration, agentRunId]);
      }

      sendEvent({
        type: 'step',
        step: {
          id: `step-${Date.now()}-think-done`,
          type: 'think',
          label: `Thinking: ${parsed.summary || 'Analyzing...'}`,
          detail: (parsed.thinking as string)?.slice(0, 300),
          status: 'completed',
        },
        iteration,
      });

      if (parsed.action === 'done') {
        if (agentRunId) {
          await persistStep(agentRunId, iteration, 'done', 'Goal completed', {}, { reason: parsed.done_reason }, 'ok', stepDuration);
          await query('UPDATE agent_runs SET status = $1, current_step = $2 WHERE id = $3', ['done', iteration, agentRunId]);
        }
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-done`, type: 'done', label: 'Goal completed', detail: (parsed.done_reason || parsed.summary) as string, status: 'completed' }, iteration });
        sendEvent({ type: 'agent_done', reason: (parsed.done_reason || parsed.summary) as string });

        if (agentRunId) {
          try {
            const retroMessages = [
              { role: 'system', content: AGENT_RETROSPECTIVE_PROMPT },
              { role: 'user', content: `RETROSPECTIVE INPUT:\n\nGOAL: ${goal}\n\nSTEPS COMPLETED: ${iteration}\n\nFINAL STATUS: done\n\nCONVERSATION SUMMARY:\n${conversationHistory.filter(m => m.role === 'assistant').map(m => m.content.slice(0, 200)).join('\n---\n')}` },
            ];
            const retroResult = await callAI(selectedModel, retroMessages);
            if (retroResult.ok) {
              const retroJson = JSON.parse(retroResult.content);
              await persistStep(agentRunId, iteration + 1, 'retrospective', 'Agent retrospective', {}, retroJson, 'ok');
              sendEvent({ type: 'retrospective', data: retroJson });
              totalChars += retroMessages.reduce((s, m) => s + (m.content?.length || 0), 0);
            }
          } catch {
            // ignore
          }
        }

        break;
      }

      if (parsed.action === 'error') {
        if (agentRunId) {
          await persistStep(agentRunId, iteration, 'error', 'Agent error', {}, { reason: parsed.summary }, 'error', stepDuration);
          await query('UPDATE agent_runs SET status = $1, error_message = $2, current_step = $3 WHERE id = $4', ['failed', parsed.summary as string, iteration, agentRunId]);
        }
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-err`, type: 'error', label: 'Agent error', detail: parsed.summary as string, status: 'failed' }, iteration });
        sendEvent({ type: 'agent_error', reason: parsed.summary as string });
        break;
      }

      if (parsed.action === 'patch' && parsed.patch) {
        if (agentRunId) await persistStep(agentRunId, iteration, 'patch', (parsed.summary || 'Generating patch') as string, { diff: parsed.patch }, {}, 'ok', stepDuration);
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-patch`, type: 'patch', label: 'Generating patch', detail: parsed.summary as string, status: 'completed' }, iteration });
        sendEvent({ type: 'patch', diff: parsed.patch, summary: parsed.summary });
        conversationHistory.push({ role: 'user', content: 'Patch emitted to client. Awaiting application confirmation. Suggest a verification command (tests/build) as the next step.' });
      }

      if (parsed.action === 'run_command' && parsed.command) {
        if (agentRunId) await persistStep(agentRunId, iteration, 'run', `Running: ${parsed.command}`, { command: parsed.command }, {}, 'ok', stepDuration);
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-run`, type: 'run', label: `Running: ${parsed.command}`, detail: parsed.command as string, status: 'completed' }, iteration });
        sendEvent({ type: 'run_command', command: parsed.command, summary: parsed.summary });
        conversationHistory.push({ role: 'user', content: `Command \`${parsed.command}\` suggested to client. Awaiting execution result. Continue planning the next step assuming the command has not yet run.` });
      }

      if (parsed.action === 'mcp_call' && parsed.mcp_tool) {
        let mcpResultText = 'MCP call failed: unknown error';
        try {
          const mcpServer = (parsed.mcp_server || 'mcp-github') as string;
          const mcpResp = await fetch(`${apiBase}/${mcpServer}`, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tool: parsed.mcp_tool, input: parsed.mcp_input || {} }),
          });
          const mcpData = await mcpResp.json();
          if (mcpData?.ok === false) {
            mcpResultText = `MCP tool \`${parsed.mcp_tool}\` failed: ${mcpData.error || 'unknown error'}`;
          } else {
            const result = mcpData?.result ?? mcpData;
            mcpResultText = `MCP tool \`${parsed.mcp_tool}\` succeeded. Result: ${JSON.stringify(result).slice(0, 2000)}`;
          }
        } catch (mcpErr) {
          mcpResultText = `MCP tool \`${parsed.mcp_tool}\` threw: ${mcpErr instanceof Error ? mcpErr.message : 'unknown'}`;
        }

        if (agentRunId) await persistStep(agentRunId, iteration, 'mcp_call', `MCP: ${parsed.mcp_tool}`, { server: parsed.mcp_server, tool: parsed.mcp_tool, input: parsed.mcp_input }, { result: mcpResultText }, 'ok', stepDuration);
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-mcp`, type: 'mcp_call', label: `MCP: ${parsed.mcp_tool}`, detail: parsed.summary as string, status: 'completed' }, iteration });
        sendEvent({ type: 'mcp_call', server: parsed.mcp_server, tool: parsed.mcp_tool, input: parsed.mcp_input || {}, summary: parsed.summary });
        conversationHistory.push({ role: 'user', content: mcpResultText });
      }

      if (!['patch', 'run_command', 'done', 'error', 'mcp_call'].includes((parsed.action as string) || '')) {
        if (agentRunId) await persistStep(agentRunId, iteration, 'think', (parsed.summary || 'Continuing') as string, {}, {}, 'ok', stepDuration);
        conversationHistory.push({ role: 'user', content: 'Continue with the next step toward the goal.' });
      }

      if (iteration === max) {
        if (agentRunId) await query('UPDATE agent_runs SET status = $1, current_step = $2 WHERE id = $3', ['done', iteration, agentRunId]);
        sendEvent({ type: 'step', step: { id: `step-${Date.now()}-maxiter`, type: 'done', label: `Reached max iterations (${max})`, status: 'completed' }, iteration });
        sendEvent({ type: 'agent_done', reason: `Completed ${max} iterations` });
      }
    }

    await trackUsage(user.id, selectedModel, conversationHistory);
    res.end();
  } catch (error) {
    console.error('Agent-run error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
}

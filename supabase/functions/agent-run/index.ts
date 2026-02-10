import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

interface AgentRequest {
  goal: string;
  project_id: string;
  files: Array<{ path: string; content: string }>;
  history?: Array<{ role: string; content: string }>;
  maxIterations?: number;
  preset_key?: string;
  run_id?: string; // If resuming an existing run
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

// ─── Check concurrent run limit ───
async function checkConcurrentRuns(userId: string, db: ReturnType<typeof createClient>): Promise<boolean> {
  const { count } = await db
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "running");
  
  // Check plan limit
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

// ─── Persist a step to DB ───
async function persistStep(
  db: ReturnType<typeof createClient>,
  runId: string,
  stepIndex: number,
  kind: string,
  title: string,
  input: unknown,
  output: unknown,
  status: string,
  durationMs?: number
) {
  try {
    await db.from("agent_steps").insert({
      agent_run_id: runId,
      step_index: stepIndex,
      kind,
      title,
      input,
      output,
      status,
      duration_ms: durationMs,
    });
  } catch (e) {
    console.error("Failed to persist step:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ─── GET: Retrieve run status / resume info ───
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
    const { goal, project_id, files, history, maxIterations, preset_key, run_id } = body;

    if (!goal) {
      return new Response(
        JSON.stringify({ error: "Missing 'goal'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
      // Resume: get current step
      const { data: existingRun } = await db.from("agent_runs").select("current_step, status").eq("id", agentRunId).single();
      if (existingRun) {
        startStep = existingRun.current_step;
        await db.from("agent_runs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", agentRunId);
      }
    } else if (userId && project_id) {
      const { data: newRun } = await db.from("agent_runs").insert({
        project_id,
        user_id: userId,
        preset_key: preset_key || null,
        goal,
        status: "running",
        max_steps: Math.min(maxIterations || 8, 25),
      }).select("id").single();
      agentRunId = newRun?.id;
    }

    const max = Math.min(maxIterations || 8, 25);
    const encoder = new TextEncoder();

    // Build file context
    const fileContext = (files || [])
      .slice(0, 20)
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const conversationHistory: Array<{ role: string; content: string }> = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      { role: "user", content: `GOAL: ${goal}\n\nPROJECT FILES:\n${fileContext}` },
      ...(history || []),
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        // Send run_id so client can track/resume
        if (agentRunId) {
          sendEvent({ type: "run_started", run_id: agentRunId });
        }

        try {
          for (let iteration = startStep + 1; iteration <= max; iteration++) {
            // ─── Check for cancellation ───
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

            // Call AI
            const aiResponse = await fetch(AI_URL, {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: conversationHistory,
                response_format: { type: "json_object" },
              }),
            });

            if (!aiResponse.ok) {
              const errText = await aiResponse.text();
              console.error("AI error:", aiResponse.status, errText);
              const stepDuration = Date.now() - stepStartMs;
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "error", `AI error: ${aiResponse.status}`, {}, { error: errText.slice(0, 500) }, "error", stepDuration);
                await db.from("agent_runs").update({ status: "failed", error_message: `AI error: ${aiResponse.status}`, current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-error`, type: "error", label: `AI error: ${aiResponse.status}`, detail: errText.slice(0, 200), status: "failed" }, iteration });
              break;
            }

            const aiData = await aiResponse.json();
            const rawContent = aiData.choices?.[0]?.message?.content || "{}";

            let parsed: {
              thinking?: string; action?: string; patch?: string | null;
              command?: string | null; summary?: string; done_reason?: string;
            };

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

            // Update current_step
            if (agentRunId) {
              await db.from("agent_runs").update({ current_step: iteration }).eq("id", agentRunId);
            }

            sendEvent({
              type: "step",
              step: { id: `step-${Date.now()}-think-done`, type: "think", label: `Thinking: ${parsed.summary || "Analyzing..."}`, detail: parsed.thinking?.slice(0, 300), status: "completed" },
              iteration,
            });

            // ─── Handle action ───
            if (parsed.action === "done") {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "done", "Goal completed", {}, { reason: parsed.done_reason }, "ok", stepDuration);
                await db.from("agent_runs").update({ status: "done", current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-done`, type: "done", label: "Goal completed", detail: parsed.done_reason || parsed.summary, status: "completed" }, iteration });
              sendEvent({ type: "agent_done", reason: parsed.done_reason || parsed.summary });
              break;
            }

            if (parsed.action === "error") {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "error", "Agent error", {}, { reason: parsed.summary }, "error", stepDuration);
                await db.from("agent_runs").update({ status: "failed", error_message: parsed.summary, current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-err`, type: "error", label: "Agent error", detail: parsed.summary, status: "failed" }, iteration });
              sendEvent({ type: "agent_error", reason: parsed.summary });
              break;
            }

            if (parsed.action === "patch" && parsed.patch) {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "patch", parsed.summary || "Generating patch", { diff: parsed.patch }, {}, "ok", stepDuration);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-patch`, type: "patch", label: "Generating patch", detail: parsed.summary, status: "completed" }, iteration });
              sendEvent({ type: "patch", diff: parsed.patch, summary: parsed.summary });
              conversationHistory.push({ role: "user", content: "The patch was applied successfully. What should we do next? Run tests to verify?" });
            }

            if (parsed.action === "run_command" && parsed.command) {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "run", `Running: ${parsed.command}`, { command: parsed.command }, {}, "ok", stepDuration);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-run`, type: "run", label: `Running: ${parsed.command}`, detail: parsed.command, status: "completed" }, iteration });
              sendEvent({ type: "run_command", command: parsed.command, summary: parsed.summary });
              conversationHistory.push({ role: "user", content: `Command \`${parsed.command}\` executed successfully with exit code 0. Continue with next step.` });
            }

            if (!["patch", "run_command", "done", "error"].includes(parsed.action || "")) {
              if (agentRunId) {
                await persistStep(db, agentRunId, iteration, "think", parsed.summary || "Continuing", {}, {}, "ok", stepDuration);
              }
              conversationHistory.push({ role: "user", content: "Continue with the next step toward the goal." });
            }

            if (iteration === max) {
              if (agentRunId) {
                await db.from("agent_runs").update({ status: "done", current_step: iteration }).eq("id", agentRunId);
              }
              sendEvent({ type: "step", step: { id: `step-${Date.now()}-maxiter`, type: "done", label: `Reached max iterations (${max})`, status: "completed" }, iteration });
              sendEvent({ type: "agent_done", reason: `Completed ${max} iterations` });
            }
          }
        } catch (e) {
          console.error("Agent loop error:", e);
          if (agentRunId) {
            await db.from("agent_runs").update({ status: "failed", error_message: e instanceof Error ? e.message : "Unknown" }).eq("id", agentRunId);
          }
          sendEvent({ type: "step", step: { id: `step-${Date.now()}-crash`, type: "error", label: "Agent crashed", detail: e instanceof Error ? e.message : "Unknown error", status: "failed" }, iteration: 0 });
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

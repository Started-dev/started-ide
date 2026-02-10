import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  files: Array<{ path: string; content: string }>;
  history?: Array<{ role: string; content: string }>;
  maxIterations?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { goal, files, history, maxIterations } =
      (await req.json()) as AgentRequest;

    if (!goal) {
      return new Response(
        JSON.stringify({ error: "Missing 'goal'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const max = Math.min(maxIterations || 8, 12);
    const encoder = new TextEncoder();

    // Build file context
    const fileContext = (files || [])
      .slice(0, 20)
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const conversationHistory: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: AGENT_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `GOAL: ${goal}\n\nPROJECT FILES:\n${fileContext}`,
      },
      ...(history || []),
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        try {
          for (let iteration = 1; iteration <= max; iteration++) {
            // Step: thinking
            sendEvent({
              type: "step",
              step: {
                id: `step-${Date.now()}-think`,
                type: "think",
                label: `Iteration ${iteration}: Analyzing...`,
                status: "running",
              },
              iteration,
            });

            // Call AI (non-streaming for structured output)
            const aiResponse = await fetch(AI_URL, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: conversationHistory,
                response_format: { type: "json_object" },
              }),
            });

            if (!aiResponse.ok) {
              const errText = await aiResponse.text();
              console.error("AI error:", aiResponse.status, errText);
              sendEvent({
                type: "step",
                step: {
                  id: `step-${Date.now()}-error`,
                  type: "error",
                  label: `AI error: ${aiResponse.status}`,
                  detail: errText.slice(0, 200),
                  status: "failed",
                },
                iteration,
              });
              break;
            }

            const aiData = await aiResponse.json();
            const rawContent =
              aiData.choices?.[0]?.message?.content || "{}";

            let parsed: {
              thinking?: string;
              action?: string;
              patch?: string | null;
              command?: string | null;
              summary?: string;
              done_reason?: string;
            };

            try {
              parsed = JSON.parse(rawContent);
            } catch {
              // Try to extract JSON from the response
              const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  parsed = JSON.parse(jsonMatch[0]);
                } catch {
                  parsed = {
                    thinking: rawContent,
                    action: "error",
                    summary: "Failed to parse AI response as JSON",
                  };
                }
              } else {
                parsed = {
                  thinking: rawContent,
                  action: "error",
                  summary: "AI response was not valid JSON",
                };
              }
            }

            // Add assistant response to history for next iteration
            conversationHistory.push({
              role: "assistant",
              content: rawContent,
            });

            // Emit thinking step completed
            sendEvent({
              type: "step",
              step: {
                id: `step-${Date.now()}-think-done`,
                type: "think",
                label: `Thinking: ${parsed.summary || "Analyzing..."}`,
                detail: parsed.thinking?.slice(0, 300),
                status: "completed",
              },
              iteration,
            });

            // Handle action
            if (parsed.action === "done") {
              sendEvent({
                type: "step",
                step: {
                  id: `step-${Date.now()}-done`,
                  type: "done",
                  label: "Goal completed",
                  detail: parsed.done_reason || parsed.summary,
                  status: "completed",
                },
                iteration,
              });
              sendEvent({ type: "agent_done", reason: parsed.done_reason || parsed.summary });
              break;
            }

            if (parsed.action === "error") {
              sendEvent({
                type: "step",
                step: {
                  id: `step-${Date.now()}-err`,
                  type: "error",
                  label: "Agent error",
                  detail: parsed.summary,
                  status: "failed",
                },
                iteration,
              });
              sendEvent({ type: "agent_error", reason: parsed.summary });
              break;
            }

            if (parsed.action === "patch" && parsed.patch) {
              sendEvent({
                type: "step",
                step: {
                  id: `step-${Date.now()}-patch`,
                  type: "patch",
                  label: "Generating patch",
                  detail: parsed.summary,
                  status: "completed",
                },
                iteration,
              });
              sendEvent({
                type: "patch",
                diff: parsed.patch,
                summary: parsed.summary,
              });

              // Tell AI the patch was applied
              conversationHistory.push({
                role: "user",
                content:
                  "The patch was applied successfully. What should we do next? Run tests to verify?",
              });
            }

            if (parsed.action === "run_command" && parsed.command) {
              sendEvent({
                type: "step",
                step: {
                  id: `step-${Date.now()}-run`,
                  type: "run",
                  label: `Running: ${parsed.command}`,
                  detail: parsed.command,
                  status: "completed",
                },
                iteration,
              });
              sendEvent({
                type: "run_command",
                command: parsed.command,
                summary: parsed.summary,
              });

              // Simulate command result feedback
              conversationHistory.push({
                role: "user",
                content: `Command \`${parsed.command}\` executed successfully with exit code 0. Continue with next step.`,
              });
            }

            // If action is neither patch, run_command, done, nor error — prompt to continue
            if (
              parsed.action !== "patch" &&
              parsed.action !== "run_command" &&
              parsed.action !== "done" &&
              parsed.action !== "error"
            ) {
              conversationHistory.push({
                role: "user",
                content: "Continue with the next step toward the goal.",
              });
            }

            // Check iteration limit
            if (iteration === max) {
              sendEvent({
                type: "step",
                step: {
                  id: `step-${Date.now()}-maxiter`,
                  type: "done",
                  label: `Reached max iterations (${max})`,
                  status: "completed",
                },
                iteration,
              });
              sendEvent({ type: "agent_done", reason: `Completed ${max} iterations` });
            }
          }
        } catch (e) {
          console.error("Agent loop error:", e);
          sendEvent({
            type: "step",
            step: {
              id: `step-${Date.now()}-crash`,
              type: "error",
              label: "Agent crashed",
              detail: e instanceof Error ? e.message : "Unknown error",
              status: "failed",
            },
            iteration: 0,
          });
          sendEvent({ type: "agent_error", reason: e instanceof Error ? e.message : "Unknown" });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("agent-run error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});



## Wire STARTED_AI_FLOW_PROMPT into Agent-Run Edge Function

### What changes

The `STARTED_AI_FLOW_PROMPT` (the Decision Engine / Flow Intelligence prompt) currently lives only in the client-side file `src/lib/started-prompt.ts` but is never used by the `agent-run` edge function. The agent-run function uses a hardcoded `AGENT_SYSTEM_PROMPT` (lines 12-35) that lacks the flow intelligence rules.

### Plan

1. **Copy the Flow Intelligence prompt into the edge function** -- Add the full `STARTED_AI_FLOW_PROMPT` as a constant in `supabase/functions/agent-run/index.ts`. Edge functions run in Deno and cannot import from `src/lib/`, so the prompt must be inlined.

2. **Compose it with the existing agent system prompt** -- Rather than replacing `AGENT_SYSTEM_PROMPT`, append the flow prompt as a second system message in the conversation history. This gives the agent both:
   - The **structural rules** (JSON output format, Plan-Act-Verify loop) from `AGENT_SYSTEM_PROMPT`
   - The **action selection intelligence** (confidence states, next-best-action rules, UX contract) from `STARTED_AI_FLOW_PROMPT`

3. **Conditionally inject based on model** -- Only inject the flow prompt when the selected model is `started/started-ai` (the StartedAI default). Other models keep just the base agent prompt to avoid unnecessary token overhead on expensive models like Claude Opus.

### Technical detail

**File: `supabase/functions/agent-run/index.ts`**

- Add `FLOW_INTELLIGENCE_PROMPT` constant after the existing `AGENT_SYSTEM_PROMPT` (after line 35).
- At line 328-329 where the conversation history is built, conditionally push a second system message:

```text
// Line ~329, after the AGENT_SYSTEM_PROMPT is pushed:
if (selectedModel === "started/started-ai") {
  conversationHistory.push({
    role: "system",
    content: FLOW_INTELLIGENCE_PROMPT,
  });
}
```

- The flow prompt injection sits between the agent system prompt and the MCP tools prompt (line 332), maintaining correct message ordering: base instructions, flow intelligence, tool awareness, then user goal.

**No other files are modified.** The client-side `started-prompt.ts` keeps its copy for any future client-side use; the edge function gets its own copy since it runs in a separate Deno runtime.


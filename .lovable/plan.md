## Started AI Policy System — Implemented

### Files Created

1. **`src/lib/policies/fsm.ts`** — Finite-State Machine spec (13 states, 21 events, full transition table, invariants)
2. **`src/lib/policies/nba.ts`** — Next Best Action scoring algorithm (candidate generation, deterministic scoring, confidence computation, action selection)
3. **`src/lib/policies/nba.policy.json`** — Default NBA policy config (weights, gates, suggestion memory, action overrides)
4. **`src/lib/policies/nba.policy.override.example.json`** — Example project override for Web3 projects
5. **`src/lib/policies/retrospective.ts`** — Agent retrospective prompt + input builder
6. **`src/lib/policies/ship-mode.ts`** — Ship Mode UX prompt (PR/deploy flow)
7. **`src/lib/policies/index.ts`** — Central export barrel

### Edge Function Integration

**`supabase/functions/agent-run/index.ts`** now includes:
- `FLOW_INTELLIGENCE_PROMPT` with embedded FSM states/transitions and NBA scoring weights (injected for `started/started-ai` only)
- `AGENT_RETROSPECTIVE_PROMPT` — auto-generates a retrospective after successful runs (persisted as a step + streamed to client)
- `SHIP_MODE_PROMPT` — available for ship-mode actions

### Architecture
- Client-side policies (`src/lib/policies/`) provide typed interfaces, scoring functions, and the FSM for UI-driven NBA
- Edge function has inlined copies of all prompts (Deno cannot import from `src/`)
- Retrospective runs automatically after agent "done" state for StartedAI model

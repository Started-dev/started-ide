// ─── Started AI Policy System ───
// Central export for all policy modules.

export { FSM_STATES, FSM_EVENTS, FSM_TRANSITIONS, FSM_INVARIANTS } from "./fsm";
export type { FSMState, FSMEvent, FSMStateInputs } from "./fsm";

export {
  ACTION_KEYS,
  generateCandidates,
  scoreAction,
  computeConfidence,
  selectActions,
} from "./nba";
export type { ActionKey, ConfidenceLevel, RiskLevel, NBASignals, ScoredAction, NBAPolicy } from "./nba";

export { AGENT_RETROSPECTIVE_PROMPT, buildRetrospectiveInput } from "./retrospective";
export { SHIP_MODE_PROMPT } from "./ship-mode";

// Default policy (importable as JSON)
import defaultPolicy from "./nba.policy.json";
export { defaultPolicy };

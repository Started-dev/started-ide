// ─── Started AI UX Finite-State Machine ───
// Governs state transitions for the AI decision engine.
// Each state maps to allowed events and their target states.

export const FSM_STATES = {
  S0_IDLE: "IDLE",
  S1_CONTEXT_GATHERING: "CONTEXT_GATHERING",
  S2_PLANNING: "PLANNING",
  S3_PATCH_READY: "PATCH_READY",
  S4_DIFF_REVIEW: "DIFF_REVIEW",
  S5_APPLYING_PATCH: "APPLYING_PATCH",
  S6_RUNNING_COMMAND: "RUNNING_COMMAND",
  S7_EVALUATING_RESULTS: "EVALUATING_RESULTS",
  S8_NEEDS_APPROVAL: "NEEDS_APPROVAL",
  S9_AGENT_RUNNING: "AGENT_RUNNING",
  S10_BLOCKED: "BLOCKED",
  S11_SHIP_READY: "SHIP_READY",
  S12_DONE: "DONE",
} as const;

export type FSMState = typeof FSM_STATES[keyof typeof FSM_STATES];

export const FSM_EVENTS = {
  E1: "user.message_submitted",
  E2: "user.selection_changed",
  E3: "patch.generated",
  E4: "patch.preview_opened",
  E5: "patch.applied_ok",
  E6: "patch.applied_error",
  E7: "run.started",
  E8: "run.log",
  E9: "run.done_ok",
  E10: "run.done_error",
  E11: "permission.ask_triggered",
  E12: "permission.approved",
  E13: "permission.denied",
  E14: "agent.started",
  E15: "agent.step_done",
  E16: "agent.blocked",
  E17: "agent.cancelled",
  E18: "ship.requested",
  E19: "attestation.generated",
  E20: "replay.requested",
  E21: "replay.done",
} as const;

export type FSMEvent = typeof FSM_EVENTS[keyof typeof FSM_EVENTS];

/** State inputs observed continuously by the decision engine */
export interface FSMStateInputs {
  editor: {
    activeFile: string | null;
    selection: string | null;
  };
  repo: {
    currentRef: string;
    diffStatus: {
      clean: boolean;
      filesChanged: number;
      linesAdded: number;
      linesRemoved: number;
    };
  };
  runs: {
    lastRun: {
      status: "none" | "running" | "ok" | "error";
      command: string | null;
      exitCode: number | null;
    };
  };
  agent: {
    runStatus: "idle" | "running" | "blocked" | "paused" | "done" | "failed" | "cancelled";
  };
  permissions: {
    pending: "none" | "ask_required";
  };
  mcp: {
    lastCall: "none" | "ok" | "blocked" | "error";
  };
  timeline: {
    recentEvents: Array<{ type: string; timestamp: number }>;
  };
  user: {
    ignoredSuggestionsCount: number;
    prefersAutoRun: boolean;
    prefersDiffFirst: boolean;
  };
}

/** Transition table: [currentState][event] -> nextState */
export const FSM_TRANSITIONS: Record<string, Record<string, FSMState>> = {
  IDLE: {
    "user.message_submitted": "CONTEXT_GATHERING",
    "ship.requested": "SHIP_READY", // if verification ok, else RUNNING_COMMAND
  },
  CONTEXT_GATHERING: {
    // auto-transition after gathering
    _auto: "PLANNING",
  },
  PLANNING: {
    "patch.generated": "PATCH_READY",
    "run.started": "RUNNING_COMMAND",
    _no_action: "IDLE",
  },
  PATCH_READY: {
    "patch.preview_opened": "DIFF_REVIEW",
    "patch.applied_ok": "APPLYING_PATCH",
  },
  DIFF_REVIEW: {
    "patch.applied_ok": "APPLYING_PATCH",
    _refine: "PLANNING",
    _discard: "IDLE",
  },
  APPLYING_PATCH: {
    "patch.applied_ok": "RUNNING_COMMAND",
    "patch.applied_error": "BLOCKED",
  },
  RUNNING_COMMAND: {
    "permission.ask_triggered": "NEEDS_APPROVAL",
    "run.done_ok": "EVALUATING_RESULTS",
    "run.done_error": "EVALUATING_RESULTS",
  },
  EVALUATING_RESULTS: {
    _ok_attestation: "SHIP_READY",
    _error: "PLANNING", // with @errors attached
    _ok_no_tests: "SHIP_READY", // medium confidence
  },
  NEEDS_APPROVAL: {
    "permission.approved": "RUNNING_COMMAND",
    "permission.denied": "BLOCKED",
  },
  AGENT_RUNNING: {
    "agent.step_done": "AGENT_RUNNING",
    "agent.blocked": "BLOCKED",
    "agent.cancelled": "IDLE",
    _done_verified: "SHIP_READY",
  },
  BLOCKED: {
    _resolved: "CONTEXT_GATHERING",
    _cancelled: "IDLE",
  },
  SHIP_READY: {
    "attestation.generated": "SHIP_READY",
    "ship.requested": "DONE",
  },
  DONE: {
    _reset: "IDLE",
  },
};

/** Invariants that must always hold */
export const FSM_INVARIANTS = [
  "Never apply patch without snapshot",
  "Never run commands without policy gate",
  "Any state-changing ops require explicit approval when risk!=read",
  "Every run completion produces/links attestation when possible",
] as const;

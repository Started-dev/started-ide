// ─── Next Best Action Scoring Algorithm ───
// Deterministic + tunable scoring for action selection.

/** All stable action keys used across the system */
export const ACTION_KEYS = [
  "preview_diff",
  "apply_patch",
  "apply_and_run",
  "run_tests",
  "run_build",
  "rerun_last",
  "explain_error",
  "fix_or_plan",
  "continue_agent",
  "start_agent",
  "pause_agent",
  "cancel_agent",
  "generate_attestation",
  "replay_attestation",
  "create_pr",
  "deploy",
  "inspect_file",
  "search_project",
  "refine_patch",
] as const;

export type ActionKey = typeof ACTION_KEYS[number];

export type ConfidenceLevel = "high" | "medium" | "low";
export type RiskLevel = "read" | "simulate" | "write";

/** Feature signals computed from FSM state */
export interface NBASignals {
  hasPatch: boolean;
  diffDirty: boolean;
  lastRunFailed: boolean;
  lastRunOk: boolean;
  hasSuggestedCommands: boolean;
  testsKnown: boolean;
  testsExist: boolean;
  agentRunning: boolean;
  agentBlocked: boolean;
  needsApproval: boolean;
  riskLevel: RiskLevel;
  userIgnoredCount: Record<string, number>;
  timeSinceLastProgressSec: number;
}

/** Candidate action produced by the scoring engine */
export interface ScoredAction {
  key: ActionKey;
  score: number;
  confidence: ConfidenceLevel;
  reason: string;
  label: string;
}

/** Policy configuration (loaded from nba.policy.json + overrides) */
export interface NBAPolicy {
  version: number;
  max_actions: { primary: number; secondary: number };
  confidence_thresholds: { high: number; medium: number };
  defaults: {
    prefer_preview_before_apply: boolean;
    auto_attach_context: {
      errors_last_run: boolean;
      diff_current: boolean;
      active_file: boolean;
    };
    never_ship_without_verification: boolean;
  };
  weights: {
    urgency: Record<string, number>;
    verification_bonus: Record<string, number>;
    momentum_bonus: Record<string, number>;
    safety_penalty: Record<string, number>;
    friction_penalty: Record<string, number>;
  };
  gates: {
    hard_deny_command_patterns: string[];
    ship_requires: { attestation: boolean; tests_or_build: boolean };
  };
  suggestion_memory: {
    ignore_decay_days: number;
    max_ignore_count_before_suppress: number;
  };
  action_overrides: Record<string, Record<string, unknown>>;
}

/** Generate candidate actions based on FSM state */
export function generateCandidates(fsmState: string, signals: NBASignals): ActionKey[] {
  const candidates: ActionKey[] = [];

  switch (fsmState) {
    case "IDLE":
      candidates.push("inspect_file", "search_project", "start_agent");
      break;
    case "CONTEXT_GATHERING":
      candidates.push("inspect_file", "search_project");
      break;
    case "PLANNING":
      candidates.push("preview_diff", "apply_patch", "run_tests", "run_build", "explain_error");
      break;
    case "PATCH_READY":
      candidates.push("preview_diff", "apply_patch", "apply_and_run", "refine_patch");
      break;
    case "DIFF_REVIEW":
      candidates.push("apply_patch", "apply_and_run", "refine_patch");
      break;
    case "APPLYING_PATCH":
      candidates.push("run_tests", "run_build");
      break;
    case "RUNNING_COMMAND":
      candidates.push("explain_error");
      break;
    case "EVALUATING_RESULTS":
      candidates.push("fix_or_plan", "explain_error", "generate_attestation", "create_pr", "deploy");
      break;
    case "AGENT_RUNNING":
      candidates.push("continue_agent", "pause_agent", "cancel_agent");
      break;
    case "BLOCKED":
      candidates.push("explain_error", "fix_or_plan", "cancel_agent");
      break;
    case "SHIP_READY":
      candidates.push("create_pr", "deploy", "generate_attestation", "replay_attestation", "run_tests");
      break;
    default:
      candidates.push("inspect_file");
  }

  // Force-include fix path when last run failed
  if (signals.lastRunFailed && !candidates.includes("fix_or_plan")) {
    candidates.push("fix_or_plan");
  }
  if (signals.lastRunFailed && !candidates.includes("explain_error")) {
    candidates.push("explain_error");
  }

  return candidates;
}

/** Score a single action given signals and policy, returning score and reason */
export function scoreAction(
  action: ActionKey,
  signals: NBASignals,
  policy: NBAPolicy
): { score: number; reason: string } {
  let score = 0;
  const w = policy.weights;
  const reasons: string[] = [];

  // Urgency
  if (signals.lastRunFailed && ["explain_error", "fix_or_plan"].includes(action)) {
    const v = w.urgency.last_run_failed || 0;
    score += v;
    if (v) reasons.push(`Last run failed (+${v})`);
  }
  if (signals.agentBlocked && ["explain_error", "fix_or_plan"].includes(action)) {
    const v = w.urgency.agent_blocked || 0;
    score += v;
    if (v) reasons.push(`Agent blocked (+${v})`);
  }
  if (signals.diffDirty && !signals.lastRunOk && ["run_tests", "run_build"].includes(action)) {
    const v = w.urgency.diff_dirty_unverified || 0;
    score += v;
    if (v) reasons.push(`Unverified diff (+${v})`);
  }
  if (signals.hasPatch && ["preview_diff", "apply_patch"].includes(action)) {
    const v = w.urgency.patch_ready_unapplied || 0;
    score += v;
    if (v) reasons.push(`Patch ready (+${v})`);
  }
  if (signals.timeSinceLastProgressSec > 60) {
    const v = w.urgency.time_since_progress_60s || 0;
    score += v;
    if (v) reasons.push(`Stale >60s (+${v})`);
  }

  // Verification bonus
  if (action === "run_tests") { const v = w.verification_bonus.run_tests || 0; score += v; if (v) reasons.push(`Verification (+${v})`); }
  if (action === "run_build") { const v = w.verification_bonus.run_build || 0; score += v; if (v) reasons.push(`Build check (+${v})`); }
  if (action === "generate_attestation") { const v = w.verification_bonus.generate_attestation || 0; score += v; if (v) reasons.push(`Attestation (+${v})`); }
  if (action === "replay_attestation") { const v = w.verification_bonus.replay_attestation || 0; score += v; if (v) reasons.push(`Replay (+${v})`); }

  // Momentum bonus
  if (action === "preview_diff" && signals.hasPatch) { const v = w.momentum_bonus.preview_diff_when_patch_ready || 0; score += v; if (v) reasons.push(`Preview momentum (+${v})`); }
  if (action === "apply_patch") { const v = w.momentum_bonus.apply_patch_after_preview || 0; score += v; if (v) reasons.push(`Apply momentum (+${v})`); }
  if (action === "apply_and_run" || (action === "run_tests" && signals.hasPatch)) { const v = w.momentum_bonus.run_after_apply || 0; score += v; if (v) reasons.push(`Run after apply (+${v})`); }
  if (action === "continue_agent" && signals.agentRunning) { const v = w.momentum_bonus.continue_agent || 0; score += v; if (v) reasons.push(`Continue agent (+${v})`); }

  // Safety penalty
  if (signals.riskLevel === "simulate") { const v = w.safety_penalty.risk_simulate || 0; score -= v; if (v) reasons.push(`Simulate risk (-${v})`); }
  if (signals.riskLevel === "write") { const v = w.safety_penalty.risk_write || 0; score -= v; if (v) reasons.push(`Write risk (-${v})`); }
  if (signals.needsApproval) { const v = w.safety_penalty.requires_approval_ungranted || 0; score -= v; if (v) reasons.push(`Needs approval (-${v})`); }

  // Friction penalty
  const ignoredCount = signals.userIgnoredCount[action] || 0;
  if (ignoredCount > 0) {
    const v = ignoredCount * (w.friction_penalty.ignored_multiplier || 0);
    score -= v;
    reasons.push(`Ignored ${ignoredCount}x (-${v})`);
  }

  return { score, reason: reasons.join("; ") || "Base action" };
}

/** Compute confidence level from normalized score */
export function computeConfidence(
  score: number,
  maxScore: number,
  thresholds: { high: number; medium: number }
): ConfidenceLevel {
  const normalized = maxScore > 0 ? score / maxScore : 0;
  if (normalized >= thresholds.high) return "high";
  if (normalized >= thresholds.medium) return "medium";
  return "low";
}

/** Select primary + secondary actions from scored candidates */
export function selectActions(
  candidates: ActionKey[],
  signals: NBASignals,
  policy: NBAPolicy
): { primary: ScoredAction | null; secondary: ScoredAction[] } {
  // Filter hard-denied
  const filtered = candidates.filter(c => {
    // Suppress ship/deploy when last run failed
    const overrides = policy.action_overrides?.when_last_run_failed;
    if (signals.lastRunFailed && overrides?.suppress) {
      if ((overrides.suppress as string[]).includes(c)) return false;
    }
    // Suppress start_agent when agent already running
    const agentOverrides = policy.action_overrides?.when_agent_running;
    if (signals.agentRunning && agentOverrides?.suppress) {
      if ((agentOverrides.suppress as string[]).includes(c)) return false;
    }
    return true;
  });

  // Score all
  const scored = filtered.map(key => {
    const result = scoreAction(key, signals, policy);
    return { key, score: result.score, reason: result.reason };
  }).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { primary: null, secondary: [] };

  const maxScore = Math.max(...scored.map(s => s.score), 1);
  const thresholds = policy.confidence_thresholds;

  const toScoredAction = (item: { key: ActionKey; score: number; reason: string }): ScoredAction => ({
    key: item.key,
    score: item.score,
    confidence: computeConfidence(item.score, maxScore, thresholds),
    reason: item.reason,
    label: actionLabel(item.key),
  });

  const primary = toScoredAction(scored[0]);

  // Secondary: within 70% of primary score, up to max_actions.secondary
  const secondaryCap = policy.max_actions.secondary;
  const threshold70 = primary.score * 0.7;
  const secondary = scored
    .slice(1)
    .filter(s => s.score >= threshold70)
    .slice(0, secondaryCap)
    .map(toScoredAction);

  return { primary, secondary };
}

/** Human-readable labels for action keys */
function actionLabel(key: ActionKey): string {
  const labels: Record<ActionKey, string> = {
    preview_diff: "Preview diff",
    apply_patch: "Apply patch",
    apply_and_run: "Apply & run",
    run_tests: "Run tests",
    run_build: "Run build",
    rerun_last: "Re-run last command",
    explain_error: "Explain error",
    fix_or_plan: "Fix failing run",
    continue_agent: "Continue agent",
    start_agent: "Start agent",
    pause_agent: "Pause agent",
    cancel_agent: "Cancel agent",
    generate_attestation: "Generate attestation",
    replay_attestation: "Replay attestation",
    create_pr: "Create PR",
    deploy: "Deploy",
    inspect_file: "Inspect file",
    search_project: "Search project",
    refine_patch: "Refine patch",
  };
  return labels[key] || key;
}

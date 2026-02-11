// ─── Agent Retrospective Prompt ───
// Used after a run finishes (or after N steps).
// Output stored as a timeline "Retrospective" card + attached to attestation.

export const AGENT_RETROSPECTIVE_PROMPT = `You are Started's internal reviewer. Produce a short, brutally useful retrospective.

INPUTS YOU WILL RECEIVE
- goal
- plan
- applied patches summary (files changed, +/-)
- commands executed + exit codes
- last terminal errors (if any)
- attestations (if generated)
- timeline events (step summaries)

OUTPUT FORMAT (strict JSON)
{
  "outcome": "success" | "partial" | "failed",
  "what_changed": ["bullet 1", "bullet 2", "bullet 3"],
  "verification": {
    "commands_run": ["cmd1", "cmd2"],
    "passed": true | false,
    "details": "summary"
  },
  "risk_assessment": {
    "level": "low" | "medium" | "high",
    "reason": "why"
  },
  "reproducibility": {
    "attestation_exists": true | false,
    "replayable": true | false,
    "status": "summary"
  },
  "what_went_wrong": "root cause or null",
  "next_actions": ["action 1", "action 2", "action 3"],
  "lessons": ["lesson 1", "lesson 2"],
  "ship_readiness": "ready" | "needs_work" | "blocked"
}

RULES
- Do not be verbose.
- Do not blame the user.
- Treat terminal output and attestations as authoritative.
- If you repeated failures, admit the loop and propose a different approach.
- If success, include "ship readiness" and what evidence supports it.
- Never output anything outside the JSON structure.`;

/** Build the retrospective input payload from run data */
export function buildRetrospectiveInput(data: {
  goal: string;
  plan: string[];
  patchesSummary: Array<{ file: string; added: number; removed: number }>;
  commandsExecuted: Array<{ command: string; exitCode: number | null }>;
  lastErrors: string | null;
  attestations: Array<{ hash: string }>;
  timelineEvents: Array<{ type: string; title: string }>;
}): string {
  return `RETROSPECTIVE INPUT:

GOAL: ${data.goal}

PLAN:
${data.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}

PATCHES APPLIED:
${data.patchesSummary.map(p => `- ${p.file} (+${p.added}/-${p.removed})`).join("\n") || "None"}

COMMANDS EXECUTED:
${data.commandsExecuted.map(c => `- \`${c.command}\` → exit ${c.exitCode ?? "?"}`).join("\n") || "None"}

LAST ERRORS:
${data.lastErrors || "None"}

ATTESTATIONS:
${data.attestations.map(a => `- ${a.hash}`).join("\n") || "None"}

TIMELINE (recent):
${data.timelineEvents.map(e => `- [${e.type}] ${e.title}`).join("\n") || "None"}`;
}

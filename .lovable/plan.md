
# Agent Panel UI Redesign — Cursor-Style Clean Timeline

## Problem

The current `AgentTimeline` component has a busy vertical-dot timeline with many small badges (Web3, duration, file changes) that creates visual noise. Compared to Cursor's agent panel (reference images), it looks cluttered and unfocused. The core layout problems:

- **Vertical dot timeline** with colored circles adds visual weight without adding clarity
- **All steps are expanded** — no collapsibility for iteration groups
- **Thinking content is truncated** to 300 chars with no expand option
- **File changes use inline badges** instead of clean file-path indicators
- **No clear iteration grouping** — steps blend together
- **Status badges use colored backgrounds** that compete for attention

## Solution: Redesign to Match Cursor's Agent Panel

### Design Principles (from reference screenshots)
1. **Group by iteration** — each iteration is a collapsible section with header "Iteration N: Analyzing..."
2. **Thinking sections** — show "Thinking:" label in accent color, with expandable multi-line content
3. **Running sections** — show "Running:" with command text in green, expandable output
4. **Clean header** — "AGENT" label + status badge (completed/running) + "New Run" button, right-aligned
5. **Goal summary** at bottom when done
6. **Minimal chrome** — no dot timeline, no colored circles, just clean indented sections

### Component Changes

**File: `src/components/ide/AgentTimeline.tsx`** — Full redesign

Current structure (dot timeline with per-step rendering) replaced with:

```text
+--------------------------------------------------+
| AGENT   [completed]              [+ New Run]     |
+--------------------------------------------------+
| Goal text here...                                |
| < Iteration 3/10  @ 39.8s  18 steps             |
+--------------------------------------------------+
|                                                  |
| > Iteration 3: Analyzing...                     |
|   Thinking: Creating a directory indexer...      |
|     (expandable full text)                       |
|   Running: cat << 'EOF' > scripts/generate...   |
|     (expandable command + output)                |
|                                                  |
| > Iteration 4: Analyzing...                     |
|   Thinking: Executing the full pipeline...       |
|   Running: node scripts/generate-bulk-temp...    |
|                                                  |
| > Iteration 5: Analyzing...                     |
|   ...                                           |
|                                                  |
| v Goal completed                                 |
|   I have created the directory structure...      |
+--------------------------------------------------+
```

Key implementation details:
- Group `agentRun.steps` by iteration number (parse from step labels or track via metadata)
- Each iteration group is a collapsible `<details>`-style element
- "Thinking:" sections use the primary/orange accent color for the label, muted text for content
- "Running:" sections use green for the label, monospace for commands
- "Patch" steps show compact file path list (just filenames, not badges)
- "Goal completed" gets a distinct bottom section with the summary text
- Remove the vertical dot timeline entirely
- Remove Web3 op-type badges (niche, adds noise)
- Duration shown only at iteration level, not per-step

**File: `src/types/agent.ts`** — Minor addition

Add an optional `iteration` field to `AgentStep` so steps can be properly grouped:
```typescript
export interface AgentStep {
  // ...existing fields
  iteration?: number;  // which iteration this step belongs to
}
```

**File: `src/contexts/IDEContext.tsx`** — Pass iteration to steps

In the `onStep` callback (line ~1239), attach the `iteration` number to each step:
```typescript
addStep({
  ...existing fields,
  iteration,  // add this
});
```

### What stays the same
- The `startAgent`/`stopAgent`/`pauseAgent` logic is untouched
- The edge function `agent-run/index.ts` is untouched — it already works correctly
- The `ChatPanel.tsx` agent mode toggle is untouched
- All agent reconnection logic stays

### What gets removed
- Dot timeline (vertical line + colored circles)
- Web3 op-type badges (`Web3OpBadge`, `isWeb3MCP`)
- Per-step duration display (moved to iteration level)
- The `stepIcon` and `statusColors` mappings (no longer needed)

## Files to Modify
- `src/components/ide/AgentTimeline.tsx` — full redesign
- `src/types/agent.ts` — add `iteration` field to `AgentStep`
- `src/contexts/IDEContext.tsx` — pass iteration number to step objects

## No Backend Changes
The agent edge function already streams properly structured events. This is purely a frontend UI cleanup.

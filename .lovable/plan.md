

## Redesign: Started.dev AI Chat Pane — System-Level AI Interface

This is a structural transformation of the chat pane from a basic messaging sidebar into a mission-control AI interface. The implementation is broken into 11 deliverables across new and modified files, designed to integrate deeply with the existing FSM, NBA policy engine, agent system, and project state.

---

### Architecture Overview

The current `ChatPanel.tsx` (383 lines, monolithic) will be decomposed into a modular system of sub-components, each responsible for a distinct UX concern. A new `useSystemPulse` hook will drive real-time state awareness, and the existing NBA scoring engine will power pre-typing suggestions and hesitation detection.

```text
ChatPanel (orchestrator)
 +-- ChatHeader (pulse indicator, agent accent line)
 +-- ConversationTabs (existing, cleaned up)
 +-- MessageList
 |    +-- UserMessage (existing, minor restyle)
 |    +-- AssistantMessage (NEW: modular block renderer)
 |    |    +-- PlanBlock (collapsible)
 |    |    +-- PatchBlock (animated diff)
 |    |    +-- CommandBlock (clickable chips)
 |    |    +-- VerificationBlock (status badge)
 |    |    +-- ConfidenceFooter
 |    |    +-- RewindReasoning (expandable)
 |    +-- AgentStepInline (when agent mode active)
 +-- SuggestionCards (NBA-driven, pre-typing)
 +-- HesitationPrompt (30s inactivity detection)
 +-- ContextStrip (auto-populated state chips)
 +-- ChatInput (existing, restructured)
 +-- IdleCollapseStrip (60s collapse to vertical signal)
```

---

### Deliverable 1: Context Strip (Auto-populated State Chips)

**New file:** `src/components/ide/chat/ContextStrip.tsx`

Renders a horizontal strip of pill-shaped chips directly above the chat input, auto-populated from IDE state:

- `@file: {activeFileName}` -- from `activeTabId` / `getFileById`
- `@diff: +N -M` -- computed from `pendingPatches` with dirty state
- `@run: {status}` -- from last entry in `runs[]`
- `@snapshot: {ref}` -- from latest snapshot
- `@agent: step N/M` -- from `agentRun` when active

Each chip: soft border (`border border-border/60`), low-contrast bg (`bg-muted/40`), pill-rounded (`rounded-full`), hover tooltip via Radix `Tooltip`. Dismissible via small X. Chips auto-attach/detach as state changes via `useEffect` watchers on IDE context values.

---

### Deliverable 2: Structured Response Blocks (Assistant Message Refactor)

**New file:** `src/components/ide/chat/AssistantMessage.tsx`

Replaces the current inline `ChatMessage` sub-component for assistant messages. Parses message content into structural sections using regex detection:

- **Plan block**: Lines starting with `Plan:` or bulleted lists following plan headers. Rendered in a collapsible card (default open). Uses `Collapsible` from Radix.
- **Patch block**: Fenced ` ```diff ` blocks. Extracted and rendered via `AnimatedDiffBlock` (see Deliverable 9). Default collapsed if >20 lines.
- **Command block**: Fenced ` ```bash/sh ` blocks or `Cmd:` sections. Each line becomes a clickable action chip that triggers `runCommand`.
- **Verification block**: Parsed from "Verification:" or status keywords. Small badge showing Passed/Failed/Unverified with optional attestation hash.
- **Plain text**: Everything else renders as styled prose.

Each block has subtle separation (`border-b border-border/30`), clean spacing (`space-y-3`), no heavy borders, slight bg differentiation for code sections.

---

### Deliverable 3: Confidence Footer

**New file:** `src/components/ide/chat/ConfidenceFooter.tsx`

Appended to every assistant message. Extracts confidence from:
1. Explicit `Confidence:` lines in the response
2. Fallback: computed from NBA `computeConfidence()` based on current FSM state signals

Renders bottom-right aligned:
- `Confidence: High|Medium|Low` -- color-coded subtly (green/amber/gray)
- `Verified: Yes|No` -- based on whether a run succeeded after the patch
- `Attestation: 0xabc...` -- clickable, links to attestation replay
- If unverified: inline "Run tests?" action button

Typography: `text-[10px] text-muted-foreground/70`, right-aligned.

---

### Deliverable 4: Agent Mode Visual State

**Modified:** `src/components/ide/chat/ChatHeader.tsx` (extracted from ChatPanel)

When `agentRun` is active:
- Header receives a `2px` top accent line using `border-t-2 border-t-primary` (amber/gold from theme)
- Agent steps render inline in the message list as sequential step cards:
  - Status dot (pending/running/completed/failed)
  - Label text
  - Expandable detail (click to show)
  - Timestamp (relative, e.g., "2s ago")
- Active step has a soft pulse: `animate-pulse` on the status dot only
- On completion: compact "Run Summary" block with file change count, duration, verification status, and a "Merge to main" action chip

This reuses types from `AgentStep` and `AgentRun` in `src/types/agent.ts`.

---

### Deliverable 5: System Pulse Indicator

**New file:** `src/components/ide/chat/SystemPulse.tsx`

A small SVG waveform animation (3 bars, staggered sine wave) placed in the top-right of the chat header.

States:
- **Processing** (streaming response): bars animate at 1.2s loop, opacity 0.8
- **Agent mode**: bars use primary color, slightly faster animation (1s)
- **Idle**: bars static, opacity 0.3
- **Error**: bars red, single pulse then static

Implementation: Pure CSS animation on 3 `<rect>` elements with `animation-delay` offsets. No JS animation library needed. Total size: ~16x12px.

---

### Deliverable 6: Idle Collapse to Signal Strip

**New file:** `src/components/ide/chat/IdleCollapseStrip.tsx`
**Modified:** `src/components/ide/IDELayout.tsx`

After 60 seconds of chat inactivity (no messages sent, no streaming):
- The chat panel collapses into a thin vertical strip (`w-10`) on the right edge
- Strip shows: SystemPulse indicator + last state icon (run status, agent status)
- Hover: expands to `w-48` preview showing last message snippet
- Click: restores full chat panel

Implementation:
- New `useIdleDetection(timeoutMs: number)` hook tracks last activity timestamp
- IDELayout conditionally renders `IdleCollapseStrip` instead of `ChatPanel` when idle
- Smooth transition via `transition-all duration-300 ease-in-out`
- User activity (typing, clicking in chat) resets the idle timer

---

### Deliverable 7: Pre-Typing AI Suggestions

**New file:** `src/components/ide/chat/SuggestionCards.tsx`

When the input field is empty and the user hasn't started typing:
- Show 2-3 suggestion cards above the input area
- Generated using the existing NBA `selectActions()` with current FSM state signals
- Each card: minimal design, `bg-muted/30 border border-border/40 rounded-md px-3 py-2`
- Shows action label (e.g., "Fix failing test", "Run build", "Apply patch")
- Click executes: sends the suggestion as a message or triggers the action directly
- Auto-hide with fade-out when user starts typing (`input.length > 0`)

Signal computation:
- `hasPatch` from `pendingPatches`
- `lastRunFailed` from `runs`
- `diffDirty` from file modification state
- `agentRunning` from `agentRun`

---

### Deliverable 8: Hesitation Detection

**New file:** `src/components/ide/chat/HesitationPrompt.tsx`
**New hook:** `src/hooks/use-hesitation-detection.ts`

Monitors for 30 seconds of no user action when:
- Diff is dirty (files modified) OR
- Last run failed

Shows a subtle inline prompt above the input:
- "Tests failed. Want me to fix this?"
- "You changed 3 files. Run tests?"

Design: `bg-muted/20 border border-border/30 rounded-md px-3 py-2 text-xs`
- Dismissible via small X
- Tracks dismiss count in session; suppresses after 2 dismissals
- Not modal, not blocking

---

### Deliverable 9: Animated Diff Preview

**Modified:** `src/components/ide/chat/AnimatedDiffBlock.tsx` (new file, replaces inline diff rendering)

Patch blocks use animated line transitions:
- Added lines: `opacity-0 -> opacity-1` + `translateY(2px) -> 0` per line, staggered 30ms
- Removed lines: `opacity-1 -> opacity-0.4` with strikethrough
- Animation duration: 150ms per segment max
- Uses CSS `@keyframes` defined in Tailwind config, triggered via intersection observer (animate when scrolled into view)
- Toggle: "View Full Diff" / "Collapse" button at bottom

---

### Deliverable 10: Rewind Reasoning

**New file:** `src/components/ide/chat/RewindReasoning.tsx`

Small "Rewind Reasoning" button in the footer area of assistant messages. Uses `Collapsible` from Radix.

When expanded, shows:
- **Signals considered**: List of FSM state inputs that were active (e.g., "Last run: failed", "Diff: dirty +3 files")
- **State evaluated**: Current FSM state name
- **Action chosen**: The NBA primary action key and its score
- **Why**: One-sentence reason from `ScoredAction.reason`

Data source: At message generation time, capture a snapshot of `FSMStateInputs` and NBA `selectActions()` result, store in the `ChatMessage` type as optional `reasoning?: { signals: string[]; state: string; action: string; reason: string }`.

Requires extending `ChatMessage` type in `src/types/ide.ts`.

---

### Deliverable 11: Visual Tone and Overall Polish

**Modified:** `src/index.css`, `tailwind.config.ts`

- Add CSS custom properties for chat-specific tokens:
  - `--chat-surface: 220 14% 11%` (slightly different from card)
  - `--chat-block-bg: 220 14% 13%`
- Add keyframes for pulse waveform animation
- Add keyframes for diff line fade-in (`diff-line-enter`)
- Ensure all new components use the existing design system: `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`
- No gradients, no neon, no glow effects
- Micro-interactions: 150-200ms transitions on all interactive elements

---

### File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/ide/ChatPanel.tsx` | Major refactor | Orchestrator, delegates to sub-components |
| `src/components/ide/chat/ChatHeader.tsx` | New | Header with pulse, agent accent, tabs |
| `src/components/ide/chat/AssistantMessage.tsx` | New | Modular block renderer for AI responses |
| `src/components/ide/chat/ConfidenceFooter.tsx` | New | Confidence/verification/attestation footer |
| `src/components/ide/chat/SystemPulse.tsx` | New | Animated waveform indicator |
| `src/components/ide/chat/ContextStrip.tsx` | New | Auto-populated state chips above input |
| `src/components/ide/chat/SuggestionCards.tsx` | New | NBA-driven pre-typing suggestions |
| `src/components/ide/chat/HesitationPrompt.tsx` | New | 30s inactivity nudge |
| `src/components/ide/chat/AnimatedDiffBlock.tsx` | New | Animated diff line rendering |
| `src/components/ide/chat/RewindReasoning.tsx` | New | Expandable reasoning panel |
| `src/components/ide/chat/IdleCollapseStrip.tsx` | New | 60s idle collapse to thin strip |
| `src/components/ide/chat/CommandBlock.tsx` | New | Clickable command chips |
| `src/hooks/use-hesitation-detection.ts` | New | Inactivity + state monitoring hook |
| `src/hooks/use-idle-detection.ts` | New | Chat idle timer hook |
| `src/types/ide.ts` | Modify | Add `reasoning` field to `ChatMessage` |
| `src/components/ide/IDELayout.tsx` | Modify | Idle collapse integration |
| `src/index.css` | Modify | Chat tokens, animation keyframes |
| `tailwind.config.ts` | Modify | New animation utilities |

---

### Implementation Order

1. Types extension (`ide.ts`) -- foundation
2. CSS tokens and keyframes (`index.css`, `tailwind.config.ts`)
3. `SystemPulse` -- standalone, no dependencies
4. `ContextStrip` -- reads IDE context only
5. `AnimatedDiffBlock` -- standalone renderer
6. `ConfidenceFooter` + `RewindReasoning` -- per-message components
7. `CommandBlock` -- clickable command chips
8. `AssistantMessage` -- assembles blocks 5-7
9. `SuggestionCards` -- NBA integration
10. `HesitationPrompt` + hooks
11. `ChatHeader` -- extracted from ChatPanel
12. `ChatPanel` refactor -- wire everything together
13. `IdleCollapseStrip` + IDELayout integration


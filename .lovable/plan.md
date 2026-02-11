

## Fix: Runtime Selector Dropdown + Terminal Collapse Behavior

Two bugs, two targeted fixes.

---

### Bug 1: Runtime Selector Dropdown Not Opening

**Root cause:** The runtime selector dropdown uses `absolute bottom-full` positioning inside the terminal header. When the terminal Panel uses `collapsedSize={0}`, the panel itself has zero height and clips all overflow. Even when expanded, the panel's overflow behavior can prevent the dropdown from rendering above the toolbar.

**Fix:** Replace the hand-rolled dropdown with a Radix UI `Popover` component (already available in the project via `src/components/ui/popover.tsx`). Popovers use a Portal to render outside the DOM hierarchy, so they are never clipped by parent overflow or zero-height panels.

**Changes in `src/components/ide/TerminalPanel.tsx`:**
- Import `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover`
- Replace the `runtimeRef` div + `runtimeOpen` state + manual click-outside handler with `Popover` open/close state
- Remove the `useEffect` for click-outside detection (Radix handles this)
- Remove the `runtimeRef` ref
- The `PopoverContent` renders via Portal with `side="top"` and `align="end"` so it appears above the button regardless of panel state

---

### Bug 2: Terminal Collapses Completely (No Toolbar Visible)

**Root cause:** In `IDELayout.tsx`, the terminal Panel has `collapsedSize={0}`, which means when collapsed the panel is 0% height -- completely invisible. The toolbar disappears entirely instead of staying visible as a thin bar at the bottom.

**Fix:** Change `collapsedSize` from `0` to a small percentage (~4-5%) that accommodates the 32px toolbar header. Since the vertical PanelGroup occupies the full viewport minus the nav bar (44px) and status bar (24px), the available height is roughly `100vh - 68px`. At a typical 900px viewport, 4% is ~33px -- enough for the 32px toolbar.

Additionally, ensure the `TerminalPanel` always renders its header toolbar regardless of `showOutput` state. Only the body (terminal content + command input) should be hidden when collapsed.

**Changes in `src/components/ide/IDELayout.tsx`:**
- Change `collapsedSize={0}` to `collapsedSize={4}`
- Keep `minSize={8}` for the expanded minimum

**Changes in `src/components/ide/TerminalPanel.tsx`:**
- The component already renders the header unconditionally and only wraps the body in `{showOutput && ...}` -- this is correct and requires no change for this part

---

### Technical Summary

| File | Change |
|------|--------|
| `src/components/ide/TerminalPanel.tsx` | Replace manual runtime dropdown with Radix `Popover`; remove `runtimeRef` and click-outside `useEffect` |
| `src/components/ide/IDELayout.tsx` | Change `collapsedSize={0}` to `collapsedSize={4}` |


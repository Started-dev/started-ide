
# Fix AI Quality + Chat UX

## Problems

1. **AI ships terrible code** -- the system prompts lack critical instructions about cleaning up old code, understanding full-stack intent, and producing production-quality changes. The prompts just say "minimal patches" without enforcing code hygiene.

2. **Chat UX is rough** -- from the screenshot: suggestion cards crowd the bottom, skill chips have poor contrast (brown-on-dark), the welcome message is generic, and the overall chat layout feels cluttered.

## Part 1: Rewrite System Prompts (Full-Stack AI Engineer)

**File: `supabase/functions/started/index.ts`** and **`src/lib/started-prompt.ts`**

Both contain duplicated system prompts. Rewrite them with these critical additions:

### New prompt principles:
- **"Replace, don't append"**: When building new functionality that replaces old functionality, REMOVE the old code. Never leave dead imports, unused components, or orphaned functions.
- **Full-stack intent**: Understand what the user is trying to achieve end-to-end. If they say "design a landing page," produce the complete page -- don't just emit a hero section and stop.
- **Code hygiene rules**: Remove unused imports, delete dead code paths, clean up orphaned files. Every patch must leave the codebase cleaner than it was found.
- **Diff completeness**: When a patch modifies a function, include ALL necessary changes (imports, type updates, downstream references). Never produce a partial diff that breaks compilation.
- **Anti-patterns blacklist**: No placeholder comments like "// TODO: implement", no console.log left behind, no empty catch blocks, no any-typed parameters without reason.

### StartedAI prompt (token-efficient model):
Same rules, compressed. Add explicit: "When replacing functionality, your diff MUST remove old code lines. Never add new code next to the old version -- delete the old version."

## Part 2: Chat UX Fixes

### 2a. Suggestion Cards -- cleaner positioning
**File: `src/components/ide/chat/SuggestionCards.tsx`**

- Move inside the input area border (above the textarea) instead of floating between messages and input
- Use ghost-style buttons with subtle borders, not the current hard-bordered chips
- Cap at 2 suggestions max (not 3) to reduce clutter

### 2b. Welcome message -- useful, not generic  
**File: `src/components/ide/ChatPanel.tsx`**

When chat is empty, show a minimal welcome with 2-3 quick-action buttons instead of the raw text block visible in the screenshot. The current welcome text ("Hello! I'm Started...") renders as a plain assistant message -- replace with a styled empty-state component.

### 2c. Skill chip styling
**File: `src/components/ide/ChatPanel.tsx`**

The active-skill indicator chip uses `bg-primary/10` which on the dark theme produces that muddy brown. Change to use the same styling as other chips (`bg-primary/15 text-primary`) for visual consistency.

### 2d. User message layout fix
**File: `src/components/ide/ChatPanel.tsx`** (UserMessage component)

Context chips render OUTSIDE the message bubble (they're siblings, not children). Move them inside the bubble container so the message looks cohesive.

## Technical Details

### System prompt diff (edge function):

The STANDARD_SYSTEM_PROMPT will gain these sections:

```
CODE HYGIENE (mandatory)
- When replacing functionality, DELETE the old code. Never leave dead code alongside new code.
- Remove unused imports, orphaned functions, and dead variables in every patch.
- Every diff must compile. Include all necessary import additions/removals.
- No placeholder comments (TODO, FIXME, "implement later"). Ship complete code or explain what's missing.
- No console.log statements unless explicitly debugging. No empty catch blocks. No untyped 'any' without justification.

FULL-STACK INTENT
- Understand the user's end goal, not just the literal request. If they ask to "build a dashboard," produce the complete page with routing, data fetching, and layout -- not just a skeleton.
- When modifying a component, check if parent components, routes, or imports need updates. Include those changes.
- If a feature requires both frontend and backend changes, produce both in one response.

DIFF COMPLETENESS
- Every patch must include: import changes, type updates, and downstream reference updates.
- If removing a function, also remove all call sites. If renaming, update all references.
- Test your diff mentally: would it compile if applied? If not, add the missing pieces.
```

### SuggestionCards change:
```typescript
// Cap at 2, inside input border
const actions = [primary, ...secondary].filter(Boolean).slice(0, 2);
```

### Skill chip fix:
```typescript
// From:
<span className="... bg-primary/10 text-primary ...">
// To:
<span className="... bg-primary/15 text-primary ...">
```

## Files to Modify

1. `supabase/functions/started/index.ts` -- Rewrite both system prompts with code hygiene + full-stack intent rules
2. `src/lib/started-prompt.ts` -- Mirror the same prompt changes (keep in sync)
3. `src/components/ide/chat/SuggestionCards.tsx` -- Cap to 2 suggestions, cleaner styling
4. `src/components/ide/ChatPanel.tsx` -- Fix skill chip contrast, user message layout, add empty-state welcome

## Sequencing

1. Rewrite system prompts in edge function + prompt file (most impactful change)
2. Fix suggestion cards UX
3. Fix chip styling and user message layout
4. Deploy edge function

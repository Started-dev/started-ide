
# Make Skills Actually Work

## Problem

Skills are broken for two reasons:

1. **Skill content is silently dropped**: When you activate a skill and send a message, the skill gets packaged as a context chip with type `attachment`. But the `sendMessage` function only processes `selection`, `file`, and `errors` chip types — `attachment` chips are completely ignored and never reach the AI.

2. **Skill content is just a one-liner**: Even if the chip was processed, the content is just a brief description like "Vercel-curated React patterns for performance, hooks, and composition" — not actual system-level instructions that would change AI behavior.

## Solution

### 1. Fix chip processing to include attachment types

**File: `src/contexts/IDEContext.tsx`**

Add handling for `attachment` and `url` chip types in the `sendMessage` function so skill content actually reaches the AI context.

### 2. Upgrade skill data with real system prompts

**File: `src/data/skills-catalog.ts`**

Add a `systemPrompt` field to the `Skill` interface containing actionable instructions. Each skill will have a substantive prompt (50-200 words) that tells the AI how to behave differently when that skill is active.

Examples:
- **React Best Practices**: Instructions about preferring composition over inheritance, using custom hooks, memoization patterns, avoiding prop drilling
- **shadcn/ui**: Instructions to use shadcn/ui components, follow Radix primitives, use `cn()` utility, Tailwind variants
- **Postgres Best Practices**: Instructions about RLS policies, index design, avoiding N+1 queries

### 3. Inject skills as system-level context, not just chips

**File: `src/components/ide/ChatPanel.tsx`**

Instead of packaging skills as generic attachment chips (which get mixed with user context), inject active skill prompts as a dedicated `skillContext` string passed through to the edge function, where they get prepended to the system prompt.

**File: `src/lib/api-client.ts`**

Add a `skillContext` field to `StreamChatOptions` and pass it to the edge function.

**File: `supabase/functions/started/index.ts`**

Accept `skill_context` from the request body and append it to the system prompt so skills shape AI behavior at the system level (not as user messages that can be ignored).

## Technical Details

### Skill interface change:
```typescript
export interface Skill {
  id: string;
  name: string;
  // ...existing fields...
  systemPrompt: string;  // NEW: actionable instructions for the AI
}
```

### ChatPanel skill injection:
```typescript
// Build skill system context
const skillContext = activeSkills
  .map(id => SKILLS_CATALOG.find(s => s.id === id))
  .filter(Boolean)
  .map(s => `[Skill: ${s!.name}]\n${s!.systemPrompt}`)
  .join('\n\n');
```

### Edge function system prompt augmentation:
```typescript
let fullSystemPrompt = systemPrompt;
if (skill_context) {
  fullSystemPrompt += `\n\nACTIVE SKILLS (follow these guidelines):\n${skill_context}`;
}
```

### Fix the ignored attachment chips:
```typescript
// In sendMessage, add:
else if (chip.type === 'attachment') {
  contextParts.push(`[${chip.label}]\n${chip.content}`);
}
```

## Files to Modify

1. `src/data/skills-catalog.ts` — Add `systemPrompt` field with real instructions to each skill
2. `src/components/ide/ChatPanel.tsx` — Build skill context string instead of attachment chips
3. `src/lib/api-client.ts` — Add `skillContext` to StreamChatOptions
4. `supabase/functions/started/index.ts` — Accept and inject skill_context into system prompt
5. `src/contexts/IDEContext.tsx` — Fix attachment chip processing as a fallback

## Sequencing

1. Update Skill interface and add systemPrompts to catalog
2. Fix the attachment chip bug in IDEContext (safety net)
3. Add skillContext to api-client
4. Update ChatPanel to pass skillContext
5. Update edge function to inject skills into system prompt

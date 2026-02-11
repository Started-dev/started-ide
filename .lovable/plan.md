

# Remove All Lovable References -- Rebrand to Started.dev

## Scope

Every user-facing and code-level reference to "Lovable" will be replaced with "Started" equivalents. The underlying gateway URL (`ai.gateway.lovable.dev`) remains as-is since it's an external API endpoint, but all variable names, comments, and labels will be rebranded.

## Changes

### 1. `vite.config.ts` -- Remove lovable-tagger
- Remove the `lovable-tagger` import and its usage in the plugins array
- This is a Lovable-specific dev tool that tags components; not needed for Started

### 2. `supabase/functions/started/index.ts` -- Rebrand gateway references
- Rename all comments from "Lovable Gateway" to "Started Gateway"
- Rename internal variable references from `LOVABLE_API_KEY` to `STARTED_API_KEY` (with fallback to `LOVABLE_API_KEY` for backward compatibility)
- Update comment on line 355 from "Lovable Gateway" to "Started Gateway"

### 3. `supabase/functions/agent-run/index.ts` -- Same rebranding
- Rename comment "Call Lovable Gateway" to "Call Started Gateway"
- Rename `LOVABLE_API_KEY` references to `STARTED_API_KEY` (with fallback)

### 4. `src/components/ide/OpenClawPanel.tsx` -- Rebrand gateway label
- Change the string `'lovable-gateway'` to `'started-gateway'` (line 74)

### 5. `package.json` -- Remove lovable-tagger dependency
- Remove `lovable-tagger` from devDependencies since it's no longer used

## Technical Notes

- The actual gateway endpoint URL (`https://ai.gateway.lovable.dev/...`) stays unchanged because it's the real API server. Only labels, comments, and variable names change.
- Environment variable fallback: code will check `STARTED_API_KEY` first, then fall back to `LOVABLE_API_KEY` so nothing breaks during transition.
- The `src/integrations/supabase/client.ts` file is auto-generated and cannot be edited (this is infrastructure, not branding).


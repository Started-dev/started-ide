

# Fix Preferences + Add Agent Presets

## Problems Found

1. **Font size setting is decorative** -- The Preferences slider saves to `localStorage('editor_font_size')` but `EditorPane.tsx` hardcodes `fontSize: 13` and never reads it.
2. **Default agent preset setting is decorative** -- The dropdown saves to `localStorage('default_agent_preset')` but `IDEContext.tsx` never reads it when launching agent runs.
3. **Only 1 agent preset exists** -- "Smart Contract Builder" is the only row in the `agent_presets` table. Users need general-purpose presets.

## Changes

### 1. Wire Font Size to Editor (EditorPane.tsx)
- Read `editor_font_size` from `localStorage` (default 14)
- Listen for `storage` events so the editor updates live when user changes the setting in another tab/component
- Pass the value to Monaco's `fontSize` option instead of hardcoded `13`

### 2. Wire Default Preset to Agent Runs (IDEContext.tsx)
- When starting an agent run, read `default_agent_preset` from `localStorage`
- Pass it as `preset_key` in the `streamAgent` call so it gets recorded and used

### 3. Seed 5 New Agent Presets (Database Migration)
Insert these presets into `agent_presets`:

| Key | Name | Description |
|-----|------|-------------|
| `general_assistant` | General Assistant | All-purpose coding helper for any language or framework |
| `frontend_builder` | Frontend Builder | Specializes in React, CSS, and UI component development |
| `api_engineer` | API Engineer | Builds REST/GraphQL endpoints, middleware, and integrations |
| `debugger` | Debugger | Analyzes errors, traces bugs, and suggests targeted fixes |
| `code_reviewer` | Code Reviewer | Reviews code for quality, security, and best practices |

Each preset will have a tailored system prompt, appropriate default tools, and sensible permission defaults.

### Files Changed
- **`src/components/ide/EditorPane.tsx`** -- Read font size from localStorage, add state + storage listener
- **`src/contexts/IDEContext.tsx`** -- Read default preset from localStorage when starting agent runs
- **Database migration** -- Insert 5 new agent presets


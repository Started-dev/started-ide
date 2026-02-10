

# OpenClaw (MoltBot) One-Click Deploy from Started

## Overview

Transform the OpenClaw panel from a simple "connect to existing instance" model into a full deployment wizard -- similar to how Emergent deploys MoltBot. Users will be able to install and deploy OpenClaw/MoltBot directly from within Started, with a step-by-step guided flow.

## Current State

The OpenClaw panel currently requires users to manually provide an existing instance URL and API key. There is no way to **provision** or **install** OpenClaw from Started.

## What We'll Build

### 1. New "Install" Tab in OpenClawPanel

Add a new `install` tab to the existing panel (alongside Status, Deploy, Tasks, Skills). This tab provides a 3-step wizard:

**Step 1 -- Configure LLM Key**
- Input field for the user's LLM API key (or use the project's existing AI gateway key)
- Option to use Started's built-in Lovable AI gateway key (auto-populated)
- Validation check before proceeding

**Step 2 -- Run Installation**
- One-click "Install MoltBot" button
- Calls a new edge function `install-openclaw` that:
  - Generates a high-entropy slug (32+ bits) for the instance URL
  - Runs the MoltBot install script via the `run-command` edge function
  - Streams progress logs back to the UI in real-time
- Progress bar with live log output (tail of install log)
- Installation runs in the background; UI polls for completion
- Auto-refreshes every 10 seconds to check install status

**Step 3 -- Finish and Connect**
- Shows the generated instance URL and auto-generated API key
- "Connect" button auto-fills the OpenClaw config (URL + key) and switches to the Status tab
- Tutorial link displayed prominently: a configurable reference URL
- Copy-to-clipboard for the instance URL

### 2. New Edge Function: `install-openclaw`

A backend function that orchestrates the MoltBot installation:

```text
POST /install-openclaw
Body: { llm_key, project_id }

Flow:
1. Generate random slug (crypto.randomUUID + extra entropy)
2. Store install record in `openclaw_installations` table (project_id, slug, status: 'installing')
3. Execute the install script via run-command:
   NEW_LLM_KEY="<key>" nohup bash -c "$(curl -fsSL https://moltbot.emergent.to/install.sh)" > /tmp/moltbot_install.log 2>&1 &
4. Return { install_id, slug, status: 'installing' }

GET /install-openclaw?install_id=<id>
Flow:
1. Check install status (poll log file via run-command: tail -10 /tmp/moltbot_install.log)
2. Return { status, logs, instance_url (if complete) }
```

### 3. Database Table: `openclaw_installations`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| project_id | UUID | references projects(id) |
| user_id | UUID | who initiated |
| slug | text | high-entropy unique slug |
| instance_url | text | generated URL |
| status | text | installing, completed, failed |
| logs | text | last captured log output |
| created_at | timestamptz | default now() |
| completed_at | timestamptz | null until done |

RLS: Only the user who created the installation can read/update it.

### 4. Updated OpenClawPanel UI

The panel tabs become: **Install** | Status | Deploy | Tasks | Skills

- If no installation exists for this project, the Install tab is shown by default with the wizard
- If an installation exists and is complete, it auto-connects and defaults to the Status tab
- The Install tab shows previous installation history if one exists

The wizard UI uses a stepper component:
- Step indicators (1, 2, 3) with active/completed/pending states
- Each step has a card with instructions and action button
- Live log viewer in Step 2 (scrollable monospace area, auto-scrolls to bottom)
- Progress indicator (indeterminate during install, checkmark on complete)

### 5. Security Considerations

- Slug generation uses `crypto.getRandomValues()` with 32+ bytes of entropy to prevent guessable URLs
- LLM keys are never stored in the database -- only passed to the install script at runtime
- Install logs are truncated to last 50 lines to prevent storage bloat
- The install edge function validates the user is authenticated and owns the project

---

## Technical Details

### Files Changed

**New Files:**
- `supabase/functions/install-openclaw/index.ts` -- Edge function for MoltBot installation orchestration
- Database migration for `openclaw_installations` table

**Modified Files:**
- `src/components/ide/OpenClawPanel.tsx` -- Add Install tab with 3-step wizard, log viewer, polling logic
- `supabase/config.toml` -- Add `[functions.install-openclaw]` entry

### Install Wizard Flow

```text
User clicks "Install" tab
    |
    v
Step 1: Enter LLM Key (or use Started gateway)
    |  [Next]
    v
Step 2: Click "Install MoltBot"
    |  -> POST /install-openclaw { llm_key, project_id }
    |  -> Returns install_id
    |  -> Poll GET /install-openclaw?install_id every 10s
    |  -> Show live logs
    |  -> Wait for status === 'completed'
    v
Step 3: Installation complete!
    |  -> Show instance URL + API key
    |  -> "Connect" button auto-fills config
    |  -> Tutorial link displayed
    v
Auto-switch to Status tab (connected)
```

### Slug Generation (Edge Function)

```typescript
const bytes = new Uint8Array(16); // 128 bits of entropy
crypto.getRandomValues(bytes);
const slug = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
// Result: 32-char hex string like "a3f2b1c4d5e6f7a8b9c0d1e2f3a4b5c6"
```

### No Breaking Changes

- Existing "connect to external instance" flow remains unchanged
- The Install tab is additive -- users who already have an OpenClaw instance can skip it entirely
- All existing tabs (Status, Deploy, Tasks, Skills) continue to work as before


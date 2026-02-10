

# Advanced Hooks System + Webhook Infrastructure

## Current State

The hooks system today is **local-only and agent-scoped**: hooks live in React state (`useState`), are never persisted, and only gate tool calls (PreToolUse / PostToolUse) with simple glob matching. There is no concept of project-level webhooks, external HTTP endpoints, or hook execution logging.

## What We'll Build

### 1. Persist Hooks to Database

Create a `project_hooks` table so hooks survive page reloads and are scoped per project.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| project_id | UUID FK | references projects(id) ON DELETE CASCADE |
| event | text | PreToolUse, PostToolUse, **Webhook** (new) |
| tool_pattern | text | glob pattern or `*` |
| command_pattern | text | optional regex |
| action | text | allow, deny, log, transform, **webhook** (new) |
| webhook_url | text | optional -- destination URL for webhook action |
| label | text | human-readable name |
| enabled | boolean | default true |
| created_at | timestamptz | default now() |

RLS: only project members can CRUD their project's hooks.

### 2. New Hook Events and Actions

Expand beyond agent-only hooks:

**New Events:**
- `Webhook` -- an inbound HTTP hook that external services can call into your project
- `OnDeploy` -- fires after a deployment completes
- `OnFileChange` -- fires when specific file patterns are modified
- `OnError` -- fires when a terminal command fails

**New Actions:**
- `webhook` -- forward the event payload to an external URL (outbound webhook)
- `notify` -- send an in-IDE toast or collab message

### 3. Webhook Endpoints (Inbound)

Create a new edge function `project-webhooks` that:
- Accepts POST requests with a project-scoped secret token
- Looks up enabled hooks with `event = 'Webhook'` for the project
- Executes matching hook actions (log to `hook_execution_log`, forward to outbound URLs, etc.)
- Returns a structured response

URL pattern: `POST /project-webhooks?project_id=<id>&token=<secret>`

### 4. Webhook Execution Log

Create a `hook_execution_log` table for full observability:

| Column | Type |
|--------|------|
| id | UUID PK |
| hook_id | UUID FK |
| project_id | UUID FK |
| event | text |
| input_payload | jsonb |
| output_payload | jsonb |
| status | text (success/failed) |
| duration_ms | integer |
| created_at | timestamptz |

### 5. Webhook Management UI

Expand the existing `HooksConfig` modal into a tabbed panel:

- **Agent Hooks** tab -- existing PreToolUse / PostToolUse hooks (unchanged UX)
- **Webhooks** tab -- create/manage inbound webhook endpoints and outbound webhook actions
  - Generate webhook URL + secret token per project
  - Copy-to-clipboard for the endpoint URL
  - Test button that sends a sample payload
  - Execution log viewer showing recent invocations with status, timing, and payloads
- **Event Hooks** tab -- OnDeploy, OnFileChange, OnError hooks with webhook or notify actions

### 6. Wire Hooks to IDEContext

- Load hooks from DB on project load (replace `useState(DEFAULT_HOOKS)`)
- CRUD operations write to DB instead of local state
- `evaluateHooks` continues to work the same way for agent tool calls
- New `executeHookAction` function handles webhook/notify actions

---

## Technical Details

### Database Migration

```sql
-- Persistent hooks table
CREATE TABLE public.project_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event TEXT NOT NULL DEFAULT 'PreToolUse',
  tool_pattern TEXT NOT NULL DEFAULT '*',
  command_pattern TEXT,
  action TEXT NOT NULL DEFAULT 'deny',
  webhook_url TEXT,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read project hooks"
  ON public.project_hooks FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "Members can insert project hooks"
  ON public.project_hooks FOR INSERT
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "Members can update project hooks"
  ON public.project_hooks FOR UPDATE
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "Members can delete project hooks"
  ON public.project_hooks FOR DELETE
  USING (public.is_project_member(auth.uid(), project_id));

-- Webhook secrets per project
CREATE TABLE public.project_webhook_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  label TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, label)
);

ALTER TABLE public.project_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage webhook secrets"
  ON public.project_webhook_secrets FOR ALL
  USING (public.is_project_member(auth.uid(), project_id));

-- Execution log
CREATE TABLE public.hook_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_id UUID REFERENCES public.project_hooks(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  input_payload JSONB DEFAULT '{}',
  output_payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success',
  duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hook_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read execution logs"
  ON public.hook_execution_log FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

-- Auto-seed default hooks for new projects (optional trigger)
```

### Edge Function: `project-webhooks`

A new edge function that serves as the inbound webhook receiver:

- Validates project_id + token against `project_webhook_secrets`
- Queries enabled hooks with `event = 'Webhook'` for the project
- For each matching hook, executes the action (forward to `webhook_url`, log, etc.)
- Writes results to `hook_execution_log`
- Returns `{ ok: true, hooks_triggered: N }`

### Files Changed

- **New migration** -- creates `project_hooks`, `project_webhook_secrets`, `hook_execution_log` tables
- **`src/types/agent.ts`** -- expand `HookEvent` and `HookAction` types, add `WebhookSecret` and `HookExecution` interfaces
- **`src/components/ide/HooksConfig.tsx`** -- refactor into tabbed UI (Agent Hooks / Webhooks / Event Hooks), add webhook URL generation, test button, execution log viewer
- **`src/contexts/IDEContext.tsx`** -- load hooks from DB, CRUD via Supabase, seed defaults on first load
- **`supabase/functions/project-webhooks/index.ts`** -- new inbound webhook endpoint
- **`supabase/config.toml`** -- add `[functions.project-webhooks]` with `verify_jwt = false` (token-authenticated)

### No Breaking Changes

Existing default hooks (Block rm -rf, Log all patches, Block sudo) will be seeded into the DB on first project load via upsert. The `evaluateHooks` function signature stays the same.


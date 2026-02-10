import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** Supported event hook types */
export type EventHookType = 'OnDeploy' | 'OnFileChange' | 'OnError';

interface TriggerEventHookOptions {
  projectId: string;
  event: EventHookType;
  payload?: Record<string, unknown>;
}

interface TriggerResult {
  ok: boolean;
  hooks_triggered: number;
  results?: Array<{ hook_id: string; status: string; duration_ms: number }>;
  error?: string;
}

/**
 * Fires event hooks for a project by calling the trigger-event-hooks edge function.
 * This is the client-side API for triggering OnDeploy, OnFileChange, and OnError hooks.
 */
export async function triggerEventHooks({ projectId, event, payload = {} }: TriggerEventHookOptions): Promise<TriggerResult> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) {
      return { ok: false, hooks_triggered: 0, error: 'Not authenticated' };
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/trigger-event-hooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        event,
        payload,
      }),
    });

    const data = await resp.json();
    return data as TriggerResult;
  } catch (err) {
    return {
      ok: false,
      hooks_triggered: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Deploy-like command patterns */
const DEPLOY_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(run\s+)?(build|deploy|publish)/,
  /^(vercel|netlify|firebase)\s+(deploy|publish)/,
  /^docker\s+(build|push|compose\s+up)/,
  /^git\s+push/,
  /^rsync\s/,
  /^scp\s/,
  /^kubectl\s+(apply|rollout)/,
  /^terraform\s+apply/,
  /^ansible-playbook/,
  /^make\s+(deploy|build|release)/,
  /^cargo\s+(build\s+--release|publish)/,
  /^go\s+build/,
];

/**
 * Checks if a command looks like a deploy/build command.
 * Used to auto-trigger OnDeploy hooks after successful runs.
 */
export function isDeployCommand(command: string): boolean {
  return DEPLOY_PATTERNS.some(pattern => pattern.test(command.trim()));
}

/** Error-like exit codes that should trigger OnError hooks */
export function isErrorExit(exitCode: number): boolean {
  return exitCode !== 0;
}

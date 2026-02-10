import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Get the current user's session token, falling back to anon key. */
async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || SUPABASE_ANON_KEY;
}

interface StreamChatOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: string;
  model?: string;
  mcpTools?: Array<{ server: string; name: string; description: string }>;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export async function streamChat({ messages, context, model, mcpTools, onDelta, onDone, onError, signal }: StreamChatOptions) {
  const token = await getAuthToken();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/started`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, context, model, mcp_tools: mcpTools }),
    signal,
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: 'Unknown error' }));
    onError(data.error || `HTTP ${resp.status}`);
    return;
  }

  if (!resp.body) {
    onError('No response body');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith(':') || line.trim() === '') continue;
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') { finished = true; onDone(); return; }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        buffer = line + '\n' + buffer;
        break;
      }
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    for (let raw of buffer.split('\n')) {
      if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      if (!raw.startsWith('data: ')) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === '[DONE]') { if (!finished) { finished = true; onDone(); } continue; }
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  if (!finished) onDone();
}

interface ApplyPatchRequest {
  diff: string;
  files: Array<{ path: string; content: string }>;
}

interface ApplyPatchResult {
  success: boolean;
  results: Array<{ path: string; status: 'applied' | 'created' | 'failed'; error?: string }>;
  updatedFiles?: Array<{ path: string; content: string }>;
  snapshot?: Array<{ path: string; content: string }>;
}

export async function applyPatchRemote(request: ApplyPatchRequest): Promise<ApplyPatchResult> {
  const { data, error } = await supabase.functions.invoke('apply-patch', {
    body: request,
  });
  if (error) throw new Error(error.message);
  return data as ApplyPatchResult;
}

export interface PermissionRequest {
  command: string;
  reason: string;
  cwd: string;
}

interface RunCommandOptions {
  command: string;
  cwd?: string;
  timeoutS?: number;
  projectId?: string;
  files?: Array<{ path: string; content: string }>;
  onLog: (line: string) => void;
  onDone: (result: { exitCode: number; cwd: string; durationMs: number; changedFiles?: Array<{ path: string; content: string }> }) => void;
  onError: (error: string) => void;
  onRequiresApproval?: (req: PermissionRequest) => void;
  signal?: AbortSignal;
}

export async function runCommandRemote({ command, cwd, timeoutS, projectId, files, onLog, onDone, onError, onRequiresApproval, signal }: RunCommandOptions) {
  const token = await getAuthToken();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/run-command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ command, cwd, timeout_s: timeoutS, project_id: projectId, files }),
    signal,
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: 'Unknown error' }));
    onError(data.error || `HTTP ${resp.status}`);
    return;
  }

  const contentType = resp.headers.get('content-type') || '';

  // Non-streaming response (e.g. cd command, permission ask)
  if (contentType.includes('application/json')) {
    const data = await resp.json();
    // Handle permission "ask" response
    if (data.requiresApproval && onRequiresApproval) {
      onRequiresApproval({ command: data.command, reason: data.reason, cwd: data.cwd || cwd || '/workspace' });
      return;
    }
    if (data.stderr) onLog(data.stderr);
    if (data.stdout) onLog(data.stdout);
    onDone({ exitCode: data.exitCode ?? (data.ok ? 0 : 1), cwd: data.cwd || cwd || '/workspace', durationMs: data.durationMs ?? 0, changedFiles: data.changedFiles });
    return;
  }

  // SSE streaming
  if (!resp.body) { onError('No response body'); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'stdout') onLog(parsed.data);
          else if (parsed.type === 'stderr') onLog(parsed.data);
          else if (parsed.type === 'done') {
            onDone({ exitCode: parsed.exitCode, cwd: parsed.cwd, durationMs: parsed.durationMs });
            return;
          }
        } catch { /* ignore */ }
      }
    }
  }
}

// ─── Agent Streaming ───

export interface AgentStepEvent {
  id: string;
  type: string;
  label: string;
  detail?: string;
  status: string;
}

interface StreamAgentOptions {
  goal: string;
  files: Array<{ path: string; content: string }>;
  maxIterations?: number;
  presetKey?: string;
  model?: string;
  mcpTools?: Array<{ server: string; name: string; description: string }>;
  onStep: (step: AgentStepEvent, iteration: number) => void;
  onPatch: (diff: string, summary: string) => void;
  onRunCommand: (command: string, summary: string) => void;
  onMCPCall?: (server: string, tool: string, input: Record<string, unknown>) => void;
  onDone: (reason: string) => void;
  onError: (reason: string) => void;
  signal?: AbortSignal;
}

export async function streamAgent({
  goal, files, maxIterations, presetKey, model, mcpTools, onStep, onPatch, onRunCommand, onMCPCall, onDone, onError, signal,
}: StreamAgentOptions) {
  const token = await getAuthToken();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ goal, files, maxIterations, presetKey, model, mcp_tools: mcpTools }),
    signal,
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: 'Unknown error' }));
    onError(data.error || `HTTP ${resp.status}`);
    return;
  }

  if (!resp.body) { onError('No response body'); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'step') {
            onStep(parsed.step, parsed.iteration);
          } else if (parsed.type === 'patch') {
            onPatch(parsed.diff, parsed.summary);
          } else if (parsed.type === 'run_command') {
            onRunCommand(parsed.command, parsed.summary);
          } else if (parsed.type === 'mcp_call' && onMCPCall) {
            onMCPCall(parsed.server, parsed.tool, parsed.input);
          } else if (parsed.type === 'agent_done') {
            onDone(parsed.reason);
          } else if (parsed.type === 'agent_error') {
            onError(parsed.reason);
          }
        } catch { /* ignore partial */ }
      }
    }
  }
}

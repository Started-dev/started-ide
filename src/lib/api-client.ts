/**
 * API Client for Started IDE
 * Uses Privy authentication and Vercel Functions
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Token getter function - will be set by AuthContext
let getAccessTokenFn: (() => Promise<string | null>) | null = null;

/** Set the access token getter function (called from AuthContext) */
export function setAccessTokenGetter(fn: () => Promise<string | null>) {
  getAccessTokenFn = fn;
}

/** Get the current user's access token */
async function getAuthToken(): Promise<string | null> {
  if (!getAccessTokenFn) {
    console.warn('Access token getter not set');
    return null;
  }
  return getAccessTokenFn();
}

/** Build authorization headers */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

interface StreamChatOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context?: string;
  model?: string;
  skillContext?: string;
  mcpTools?: Array<{ server: string; name: string; description: string }>;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export async function streamChat({ messages, context, model, skillContext, mcpTools, onDelta, onDone, onError, signal }: StreamChatOptions) {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/started`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ messages, context, model, skill_context: skillContext || undefined, mcp_tools: mcpTools }),
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
  const headers = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/apply-patch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(request),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return resp.json();
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
  runtimeType?: string;
  files?: Array<{ path: string; content: string }>;
  onLog: (line: string) => void;
  onDone: (result: { exitCode: number; cwd: string; durationMs: number; changedFiles?: Array<{ path: string; content: string }> }) => void;
  onError: (error: string) => void;
  onRequiresApproval?: (req: PermissionRequest) => void;
  signal?: AbortSignal;
}

export async function runCommandRemote({ command, cwd, timeoutS, projectId, runtimeType, files, onLog, onDone, onError, onRequiresApproval, signal }: RunCommandOptions) {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/run-command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ command, cwd, timeout_s: timeoutS, project_id: projectId, runtime_type: runtimeType, files }),
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
            onDone({ exitCode: parsed.exitCode, cwd: parsed.cwd, durationMs: parsed.durationMs, changedFiles: parsed.changedFiles });
            return;
          }
        } catch { /* ignore */ }
      }
    }
  }
}

// ─── Agent Polling (reconnection after browser close) ───

export interface AgentRunStatus {
  run: { id: string; goal: string; status: string; current_step: number; max_steps: number; created_at: string; error_message?: string } | null;
  steps: Array<{ id: string; step_index: number; kind: string; title: string; status: string; duration_ms?: number; input?: unknown; output?: unknown }>;
}

export async function getAgentRunStatus(runId: string): Promise<AgentRunStatus> {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/agent-run?run_id=${encodeURIComponent(runId)}`, {
    method: 'GET',
    headers,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return { run: data.run, steps: data.steps || [] };
}

export async function cancelAgentRun(runId: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${API_BASE}/agent-run`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ run_id: runId }),
  });
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
  projectId?: string;
  maxIterations?: number;
  presetKey?: string;
  model?: string;
  mcpTools?: Array<{ server: string; name: string; description: string }>;
  onStep: (step: AgentStepEvent, iteration: number) => void;
  onPatch: (diff: string, summary: string) => void;
  onRunCommand: (command: string, summary: string) => void;
  onMCPCall?: (server: string, tool: string, input: Record<string, unknown>) => void;
  onRunStarted?: (runId: string) => void;
  onDone: (reason: string) => void;
  onError: (reason: string) => void;
  signal?: AbortSignal;
}

export async function streamAgent({
  goal, files, projectId, maxIterations, presetKey, model, mcpTools, onStep, onPatch, onRunCommand, onMCPCall, onRunStarted, onDone, onError, signal,
}: StreamAgentOptions) {
  const headers = await getAuthHeaders();
  const resp = await fetch(`${API_BASE}/agent-run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ goal, files, project_id: projectId, maxIterations, presetKey, model, mcp_tools: mcpTools }),
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
          if (parsed.type === 'run_started' && onRunStarted) {
            onRunStarted(parsed.run_id);
          } else if (parsed.type === 'step') {
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

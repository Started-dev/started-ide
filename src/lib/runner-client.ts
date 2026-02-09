/**
 * RunnerClient — abstraction over the runner service API.
 *
 * MVP: uses a MockRunnerClient that simulates session-based execution.
 * TODO: Replace with HttpRunnerClient that calls the real POST /v1/sessions/* endpoints.
 */

import {
  RunnerSession,
  ExecRequest,
  ExecResult,
  RuntimeType,
  DEFAULT_RESOURCE_LIMITS,
  ResourceLimits,
} from '@/types/runner';
import { IDEFile } from '@/types/ide';

// ─── Runner Client Interface ───

export interface IRunnerClient {
  createSession(projectId: string, runtimeType: RuntimeType): Promise<RunnerSession>;
  exec(sessionId: string, req: ExecRequest): Promise<ExecResult>;
  syncWorkspace(sessionId: string, files: IDEFile[]): Promise<void>;
  killProcess(sessionId: string): Promise<void>;
  destroySession(sessionId: string): Promise<void>;
  getSession(sessionId: string): RunnerSession | undefined;
}

// ─── Mock Runner Client ───

export class MockRunnerClient implements IRunnerClient {
  private sessions = new Map<string, RunnerSession>();
  private limits: ResourceLimits;

  constructor(limits: ResourceLimits = DEFAULT_RESOURCE_LIMITS) {
    this.limits = limits;
  }

  async createSession(projectId: string, runtimeType: RuntimeType): Promise<RunnerSession> {
    const session: RunnerSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId,
      workspacePath: `/workspace/${projectId}`,
      cwd: `/workspace/${projectId}`,
      runtimeType,
      status: 'ready',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async exec(sessionId: string, req: ExecRequest): Promise<ExecResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.status === 'killed' || session.status === 'expired') {
      throw new Error(`Session ${sessionId} is ${session.status}`);
    }

    session.status = 'busy';
    session.lastActivityAt = new Date();

    // Handle cwd changes
    if (req.resetCwd) {
      session.cwd = session.workspacePath;
    }

    const cmd = req.command.trim();

    // Parse cd commands to update session cwd
    const cdMatch = cmd.match(/^cd\s+(.+)$/);
    if (cdMatch) {
      const target = cdMatch[1];
      if (target.startsWith('/')) {
        session.cwd = target;
      } else if (target === '..') {
        session.cwd = session.cwd.split('/').slice(0, -1).join('/') || '/';
      } else {
        session.cwd = `${session.cwd}/${target}`.replace(/\/+/g, '/');
      }
      session.status = 'ready';
      return {
        ok: true, stdout: '', stderr: '', exitCode: 0,
        cwd: session.cwd, durationMs: 5,
      };
    }

    // Simulate execution delay
    const delay = cmd.includes('install') ? 2000 : cmd.includes('test') ? 1500 : 800;
    await new Promise(r => setTimeout(r, delay));

    // Check timeout
    const timeoutS = req.timeoutS ?? this.limits.timeoutS;
    
    const result = this.simulateCommand(cmd, session);
    session.status = 'ready';
    return result;
  }

  async syncWorkspace(sessionId: string, files: IDEFile[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.lastActivityAt = new Date();
    // Mock: workspace synced (in real impl, would upload files to container)
    await new Promise(r => setTimeout(r, 200));
  }

  async killProcess(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.status = 'ready';
    session.lastActivityAt = new Date();
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'killed';
      this.sessions.delete(sessionId);
    }
  }

  getSession(sessionId: string): RunnerSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ─── Command Simulation ───

  private simulateCommand(cmd: string, session: RunnerSession): ExecResult {
    const base = { cwd: session.cwd, durationMs: Math.floor(Math.random() * 2000) + 200 };

    // npm/pnpm install
    if (cmd.match(/^(npm|pnpm|yarn)\s+install/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `added 142 packages in ${(base.durationMs / 1000).toFixed(1)}s\n\n✓ Dependencies installed`,
      };
    }

    // npm test / pytest
    if (cmd.match(/^(npm\s+test|pnpm\s+test|pytest|python\s+-m\s+pytest|cargo\s+test|go\s+test)/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `PASS  src/utils.test.ts\n  ✓ greet (2ms)\n  ✓ add (1ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\nTime:        ${(base.durationMs / 1000).toFixed(1)}s`,
      };
    }

    // npm run build / tsc
    if (cmd.match(/^(npm\s+run\s+build|npx?\s+tsc|pnpm\s+build)/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `✓ Build completed successfully\nOutput: dist/`,
      };
    }

    // npm run lint
    if (cmd.match(/^(npm\s+run\s+lint|pnpm\s+lint|npx?\s+eslint)/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `✓ No lint errors found`,
      };
    }

    // git status
    if (cmd.startsWith('git status')) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `On branch main\nChanges not staged for commit:\n  modified:   src/utils.ts\n\nno changes added to commit`,
      };
    }

    // git diff / git log
    if (cmd.startsWith('git diff') || cmd.startsWith('git log')) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: cmd.startsWith('git log')
          ? `commit abc1234 (HEAD -> main)\nAuthor: dev <dev@example.com>\nDate:   ${new Date().toISOString()}\n\n    Initial commit`
          : `diff --git a/src/utils.ts b/src/utils.ts\n--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -1,3 +1,4 @@\n+/** Utility functions */\n export function greet(name: string): string {`,
      };
    }

    // python
    if (cmd.match(/^python\s+/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `[mock] Python script executed successfully`,
      };
    }

    // pip install
    if (cmd.match(/^pip\s+install/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `Successfully installed packages\n✓ Requirements satisfied`,
      };
    }

    // ls / dir
    if (cmd.match(/^(ls|dir)\b/)) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `README.md\npackage.json\nsrc/\ntsconfig.json`,
      };
    }

    // cat
    if (cmd.startsWith('cat ')) {
      return {
        ...base, ok: true, exitCode: 0, stderr: '',
        stdout: `[mock] File contents would be displayed here`,
      };
    }

    // Generic fallback
    return {
      ...base, ok: true, exitCode: 0, stderr: '',
      stdout: `$ ${cmd}\n[mock] Command executed successfully`,
    };
  }
}

// ─── HTTP Runner Client (TODO: Real Implementation) ───

/*
export class HttpRunnerClient implements IRunnerClient {
  private baseUrl: string;
  private sessions = new Map<string, RunnerSession>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createSession(projectId: string, runtimeType: RuntimeType): Promise<RunnerSession> {
    const res = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, runtimeType }),
    });
    const data = await res.json();
    const session: RunnerSession = {
      id: data.session_id,
      projectId,
      workspacePath: data.workspace_path,
      cwd: data.workspace_path,
      runtimeType,
      status: 'ready',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async exec(sessionId: string, req: ExecRequest): Promise<ExecResult> {
    const res = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: req.command,
        timeout_s: req.timeoutS,
        reset_cwd: req.resetCwd,
        env: req.env,
      }),
    });
    const data = await res.json();
    // Update session cwd from response
    const session = this.sessions.get(sessionId);
    if (session) {
      session.cwd = data.cwd;
      session.lastActivityAt = new Date();
    }
    return {
      ok: data.exit_code === 0,
      stdout: data.stdout,
      stderr: data.stderr,
      exitCode: data.exit_code,
      cwd: data.cwd,
      durationMs: data.duration_ms,
    };
  }

  async syncWorkspace(sessionId: string, files: IDEFile[]): Promise<void> {
    await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: files.filter(f => !f.isFolder).map(f => ({ path: f.path, content: f.content })),
      }),
    });
  }

  async killProcess(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/kill`, { method: 'POST' });
  }

  async destroySession(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/sessions/${sessionId}`, { method: 'DELETE' });
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): RunnerSession | undefined {
    return this.sessions.get(sessionId);
  }
}
*/

// ─── Singleton ───

let _client: IRunnerClient | null = null;

export function getRunnerClient(): IRunnerClient {
  if (!_client) {
    // TODO: Replace with HttpRunnerClient when runner service is deployed
    // _client = new HttpRunnerClient(import.meta.env.VITE_RUNNER_URL || 'http://localhost:8080');
    _client = new MockRunnerClient();
  }
  return _client;
}

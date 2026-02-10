/**
 * RunnerClient — thin session-state wrapper.
 *
 * All real command execution is handled by `runCommandRemote` in api-client.ts.
 * This module only manages local session metadata (cwd tracking, status).
 */

import { RunnerSession, RuntimeType } from '@/types/runner';

// ─── Runner Client Interface ───

export interface IRunnerClient {
  createSession(projectId: string, runtimeType: RuntimeType): Promise<RunnerSession>;
  killProcess(sessionId: string): Promise<void>;
  destroySession(sessionId: string): Promise<void>;
  getSession(sessionId: string): RunnerSession | undefined;
}

// ─── Session Manager ───

export class RemoteRunnerClient implements IRunnerClient {
  private sessions = new Map<string, RunnerSession>();

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
}

// ─── Singleton ───

let _client: IRunnerClient | null = null;

export function getRunnerClient(): IRunnerClient {
  if (!_client) {
    _client = new RemoteRunnerClient();
  }
  return _client;
}

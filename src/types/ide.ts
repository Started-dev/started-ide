export interface IDEFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  parentId: string | null;
  isFolder: boolean;
  children?: IDEFile[];
}

export interface OpenTab {
  fileId: string;
  name: string;
  path: string;
  isModified: boolean;
}

export type RunnerStatus = 'connected' | 'disconnected' | 'busy' | 'misconfigured';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contextChips?: ContextChip[];
  reasoning?: {
    signals: string[];
    state: string;
    action: string;
    reason: string;
  };
  /** Distinguishes structured card types from plain messages */
  cardType?: 'action' | 'result' | 'suggestion';
  /** For ACTION_CARD */
  actionData?: {
    actionType: string;
    command: string;
    status: 'queued' | 'running' | 'success' | 'failed';
    timestamp: Date;
  };
  /** For RESULT_CARD */
  resultData?: {
    exitCode: number;
    logs: string;
    errorSummary?: string;
    durationMs?: number;
    runnerUnavailable?: boolean;
  };
  /** For SUGGESTION_CARD */
  suggestionData?: {
    primary: { label: string; action: string };
    secondary?: Array<{ label: string; action: string }>;
  };
}

export interface ContextChip {
  type: 'selection' | 'file' | 'errors' | 'url' | 'web' | 'image' | 'attachment';
  label: string;
  content: string;
}

export interface RunResult {
  id: string;
  command: string;
  status: 'running' | 'success' | 'error';
  logs: string;
  exitCode?: number;
  cwd?: string;
  durationMs?: number;
  sessionId?: string;
  timestamp: Date;
  runnerUnavailable?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  projectId: string;
}

import type { RuntimeType } from './runner';

export interface Project {
  id: string;
  name: string;
  runtimeType: RuntimeType;
  files: IDEFile[];
}

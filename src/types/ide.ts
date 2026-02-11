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
}

export interface ContextChip {
  type: 'selection' | 'file' | 'errors' | 'url' | 'web' | 'image';
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

import { ToolCall } from './tools';

// ─── Agent Timeline ───

export type AgentStepType = 'think' | 'tool_call' | 'patch' | 'run' | 'evaluate' | 'done' | 'error' | 'mcp_call';

export interface AgentStep {
  id: string;
  type: AgentStepType;
  label: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  toolCall?: ToolCall;
  filesChanged?: AgentFileChange[];
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  iteration?: number;
}

export interface AgentFileChange {
  path: string;
  action: 'created' | 'modified';
}

export interface AgentRun {
  id: string;
  goal: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  steps: AgentStep[];
  iteration: number;
  maxIterations: number;
  startedAt: Date;
  completedAt?: Date;
}

// ─── Hooks System ───

export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Webhook' | 'OnDeploy' | 'OnFileChange' | 'OnError';

export type HookAction = 'allow' | 'deny' | 'log' | 'transform' | 'webhook' | 'notify' | 'slack' | 'discord';

export interface Hook {
  id: string;
  event: HookEvent;
  toolPattern: string; // glob pattern matching tool names
  commandPattern?: string; // optional regex for run_command args
  action: HookAction;
  label: string;
  enabled: boolean;
  webhookUrl?: string; // destination URL for webhook action
  projectId?: string; // DB-persisted hooks have a project_id
}

export interface WebhookSecret {
  id: string;
  projectId: string;
  token: string;
  label: string;
  createdAt: Date;
}

export interface HookExecution {
  id: string;
  hookId: string | null;
  projectId: string;
  event: string;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  status: 'success' | 'failed';
  durationMs: number;
  createdAt: Date;
}

export const DEFAULT_HOOKS: Hook[] = [
  {
    id: 'hook-deny-rm-rf',
    event: 'PreToolUse',
    toolPattern: 'run_command',
    commandPattern: 'rm\\s+-rf',
    action: 'deny',
    label: 'Block rm -rf',
    enabled: true,
  },
  {
    id: 'hook-log-writes',
    event: 'PostToolUse',
    toolPattern: 'apply_patch',
    action: 'log',
    label: 'Log all patches',
    enabled: true,
  },
  {
    id: 'hook-deny-sudo',
    event: 'PreToolUse',
    toolPattern: 'run_command',
    commandPattern: '^sudo\\s',
    action: 'deny',
    label: 'Block sudo',
    enabled: true,
  },
];

// ─── MCP (Model Context Protocol) ───

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or icon key
  enabled: boolean;
  requiresAuth: boolean;
  authConfigured: boolean;
  tools: MCPTool[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// MCP server definitions moved to src/types/mcp-servers.ts
export { BUILTIN_MCP_SERVERS } from './mcp-servers';

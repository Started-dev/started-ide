import { ToolCall } from './tools';

// ─── Agent Timeline ───

export type AgentStepType = 'think' | 'tool_call' | 'patch' | 'run' | 'evaluate' | 'done' | 'error';

export interface AgentStep {
  id: string;
  type: AgentStepType;
  label: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  toolCall?: ToolCall;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
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

export type HookEvent = 'PreToolUse' | 'PostToolUse';

export type HookAction = 'allow' | 'deny' | 'log' | 'transform';

export interface Hook {
  id: string;
  event: HookEvent;
  toolPattern: string; // glob pattern matching tool names
  commandPattern?: string; // optional regex for run_command args
  action: HookAction;
  label: string;
  enabled: boolean;
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

export const BUILTIN_MCP_SERVERS: MCPServer[] = [
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Repository management, issues, PRs, file operations',
    icon: '🐙',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'github_list_repos', description: 'List your repositories', inputSchema: { per_page: { type: 'number' } } },
      { name: 'github_get_repo', description: 'Get repository details', inputSchema: { owner: { type: 'string' }, repo: { type: 'string' } } },
      { name: 'github_get_file', description: 'Read file from repo', inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' } } },
      { name: 'github_list_issues', description: 'List issues', inputSchema: { owner: { type: 'string' }, repo: { type: 'string' } } },
      { name: 'github_create_issue', description: 'Create an issue', inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' } } },
      { name: 'github_create_pr', description: 'Create pull request', inputSchema: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' } } },
      { name: 'github_list_branches', description: 'List branches', inputSchema: { owner: { type: 'string' }, repo: { type: 'string' } } },
    ],
  },
  {
    id: 'mcp-vercel',
    name: 'Vercel',
    description: 'Deploy, manage projects, domains, and environment variables',
    icon: '▲',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'vercel_deploy', description: 'Deploy project', inputSchema: {} },
      { name: 'vercel_list_projects', description: 'List projects', inputSchema: {} },
      { name: 'vercel_get_deployments', description: 'Get deployments', inputSchema: {} },
    ],
  },
];

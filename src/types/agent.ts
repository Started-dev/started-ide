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
      { name: 'vercel_list_projects', description: 'List your Vercel projects', inputSchema: { limit: { type: 'number' } } },
      { name: 'vercel_get_project', description: 'Get project details', inputSchema: { projectId: { type: 'string' } } },
      { name: 'vercel_list_deployments', description: 'List deployments', inputSchema: { projectId: { type: 'string' }, limit: { type: 'number' } } },
      { name: 'vercel_get_deployment', description: 'Get deployment details', inputSchema: { deploymentId: { type: 'string' } } },
      { name: 'vercel_create_deployment', description: 'Create a deployment', inputSchema: { name: { type: 'string' }, target: { type: 'string' } } },
      { name: 'vercel_list_domains', description: 'List project domains', inputSchema: { projectId: { type: 'string' } } },
      { name: 'vercel_add_domain', description: 'Add domain to project', inputSchema: { projectId: { type: 'string' }, domain: { type: 'string' } } },
      { name: 'vercel_list_env_vars', description: 'List environment variables', inputSchema: { projectId: { type: 'string' } } },
      { name: 'vercel_create_env_var', description: 'Create environment variable', inputSchema: { projectId: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' } } },
    ],
  },
  {
    id: 'mcp-supabase',
    name: 'Supabase',
    description: 'Manage databases, storage buckets, auth users, and edge functions',
    icon: '⚡',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'supabase_list_projects', description: 'List all projects', inputSchema: {} },
      { name: 'supabase_get_project', description: 'Get project details', inputSchema: { ref: { type: 'string' } } },
      { name: 'supabase_list_tables', description: 'List public tables', inputSchema: { ref: { type: 'string' } } },
      { name: 'supabase_get_table_schema', description: 'Get column schema for a table', inputSchema: { ref: { type: 'string' }, table: { type: 'string' } } },
      { name: 'supabase_run_query', description: 'Run a read-only SQL query', inputSchema: { ref: { type: 'string' }, query: { type: 'string' } } },
      { name: 'supabase_list_buckets', description: 'List storage buckets', inputSchema: { ref: { type: 'string' } } },
      { name: 'supabase_list_users', description: 'List auth users', inputSchema: { ref: { type: 'string' } } },
      { name: 'supabase_list_functions', description: 'List edge functions', inputSchema: { ref: { type: 'string' } } },
      { name: 'supabase_get_function', description: 'Get edge function details', inputSchema: { ref: { type: 'string' }, slug: { type: 'string' } } },
    ],
  },
];

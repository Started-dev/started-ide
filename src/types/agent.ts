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
  {
    id: 'mcp-cloudflare',
    name: 'Cloudflare',
    description: 'Manage Workers, KV namespaces, DNS zones and records',
    icon: '☁️',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'cf_verify_token', description: 'Verify API token', inputSchema: {} },
      { name: 'cf_list_accounts', description: 'List accounts', inputSchema: {} },
      { name: 'cf_list_workers', description: 'List Workers scripts', inputSchema: { account_id: { type: 'string' } } },
      { name: 'cf_get_worker', description: 'Get Worker settings', inputSchema: { account_id: { type: 'string' }, script_name: { type: 'string' } } },
      { name: 'cf_delete_worker', description: 'Delete a Worker', inputSchema: { account_id: { type: 'string' }, script_name: { type: 'string' } } },
      { name: 'cf_list_kv_namespaces', description: 'List KV namespaces', inputSchema: { account_id: { type: 'string' } } },
      { name: 'cf_create_kv_namespace', description: 'Create KV namespace', inputSchema: { account_id: { type: 'string' }, title: { type: 'string' } } },
      { name: 'cf_list_kv_keys', description: 'List keys in a namespace', inputSchema: { account_id: { type: 'string' }, namespace_id: { type: 'string' } } },
      { name: 'cf_get_kv_value', description: 'Read a KV value', inputSchema: { account_id: { type: 'string' }, namespace_id: { type: 'string' }, key_name: { type: 'string' } } },
      { name: 'cf_put_kv_value', description: 'Write a KV value', inputSchema: { account_id: { type: 'string' }, namespace_id: { type: 'string' }, key_name: { type: 'string' }, value: { type: 'string' } } },
      { name: 'cf_list_zones', description: 'List DNS zones', inputSchema: {} },
      { name: 'cf_list_dns_records', description: 'List DNS records', inputSchema: { zone_id: { type: 'string' } } },
      { name: 'cf_create_dns_record', description: 'Create DNS record', inputSchema: { zone_id: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } } },
    ],
  },
  {
    id: 'mcp-aws',
    name: 'AWS',
    description: 'Manage S3 buckets, Lambda functions, and Route 53 DNS',
    icon: '🔶',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'aws_verify_credentials', description: 'Verify AWS credentials via STS', inputSchema: {} },
      { name: 'aws_list_s3_buckets', description: 'List all S3 buckets', inputSchema: {} },
      { name: 'aws_list_s3_objects', description: 'List objects in a bucket', inputSchema: { bucket: { type: 'string' }, prefix: { type: 'string' }, max_keys: { type: 'number' } } },
      { name: 'aws_get_s3_object', description: 'Read an S3 object', inputSchema: { bucket: { type: 'string' }, key: { type: 'string' } } },
      { name: 'aws_delete_s3_object', description: 'Delete an S3 object', inputSchema: { bucket: { type: 'string' }, key: { type: 'string' } } },
      { name: 'aws_list_lambda_functions', description: 'List Lambda functions', inputSchema: {} },
      { name: 'aws_get_lambda_function', description: 'Get Lambda function details', inputSchema: { function_name: { type: 'string' } } },
      { name: 'aws_invoke_lambda', description: 'Invoke a Lambda function', inputSchema: { function_name: { type: 'string' }, payload: { type: 'object' } } },
      { name: 'aws_list_hosted_zones', description: 'List Route 53 hosted zones', inputSchema: {} },
      { name: 'aws_list_dns_records', description: 'List DNS records in a hosted zone', inputSchema: { hosted_zone_id: { type: 'string' } } },
    ],
  },
  {
    id: 'mcp-stripe',
    name: 'Stripe',
    description: 'Manage customers, products, subscriptions, invoices, and payments',
    icon: '💳',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'stripe_list_customers', description: 'List customers', inputSchema: { limit: { type: 'number' } } },
      { name: 'stripe_get_customer', description: 'Get customer details', inputSchema: { customer_id: { type: 'string' } } },
      { name: 'stripe_create_customer', description: 'Create a customer', inputSchema: { email: { type: 'string' }, name: { type: 'string' } } },
      { name: 'stripe_list_products', description: 'List products', inputSchema: { limit: { type: 'number' } } },
      { name: 'stripe_create_product', description: 'Create a product', inputSchema: { name: { type: 'string' }, description: { type: 'string' } } },
      { name: 'stripe_list_prices', description: 'List prices', inputSchema: { limit: { type: 'number' }, product: { type: 'string' } } },
      { name: 'stripe_create_price', description: 'Create a price', inputSchema: { unit_amount: { type: 'number' }, currency: { type: 'string' }, product: { type: 'string' } } },
      { name: 'stripe_list_subscriptions', description: 'List subscriptions', inputSchema: { limit: { type: 'number' }, customer: { type: 'string' } } },
      { name: 'stripe_get_subscription', description: 'Get subscription details', inputSchema: { subscription_id: { type: 'string' } } },
      { name: 'stripe_cancel_subscription', description: 'Cancel a subscription', inputSchema: { subscription_id: { type: 'string' } } },
      { name: 'stripe_list_payment_intents', description: 'List payment intents', inputSchema: { limit: { type: 'number' } } },
      { name: 'stripe_get_balance', description: 'Get account balance', inputSchema: {} },
      { name: 'stripe_list_invoices', description: 'List invoices', inputSchema: { limit: { type: 'number' }, customer: { type: 'string' } } },
    ],
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    description: 'Send messages, manage channels, users, and reactions',
    icon: '💬',
    enabled: false,
    requiresAuth: true,
    authConfigured: false,
    tools: [
      { name: 'slack_list_channels', description: 'List channels', inputSchema: { limit: { type: 'number' }, types: { type: 'string' } } },
      { name: 'slack_get_channel_info', description: 'Get channel details', inputSchema: { channel: { type: 'string' } } },
      { name: 'slack_post_message', description: 'Post a message to a channel', inputSchema: { channel: { type: 'string' }, text: { type: 'string' } } },
      { name: 'slack_update_message', description: 'Update a message', inputSchema: { channel: { type: 'string' }, ts: { type: 'string' }, text: { type: 'string' } } },
      { name: 'slack_delete_message', description: 'Delete a message', inputSchema: { channel: { type: 'string' }, ts: { type: 'string' } } },
      { name: 'slack_list_users', description: 'List workspace users', inputSchema: { limit: { type: 'number' } } },
      { name: 'slack_get_user_info', description: 'Get user details', inputSchema: { user: { type: 'string' } } },
      { name: 'slack_channel_history', description: 'Get channel message history', inputSchema: { channel: { type: 'string' }, limit: { type: 'number' } } },
      { name: 'slack_set_topic', description: 'Set channel topic', inputSchema: { channel: { type: 'string' }, topic: { type: 'string' } } },
      { name: 'slack_add_reaction', description: 'Add a reaction to a message', inputSchema: { channel: { type: 'string' }, timestamp: { type: 'string' }, name: { type: 'string' } } },
    ],
  },
];

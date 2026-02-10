import { supabase } from '@/integrations/supabase/client';

export interface MCPToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
  githubToken?: string;
  vercelToken?: string;
  supabaseToken?: string;
  cloudflareToken?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  stripeToken?: string;
  slackToken?: string;
  notionToken?: string;
  n8nApiKey?: string;
  n8nBaseUrl?: string;
  serverId: string;
}

export interface MCPToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export async function callMCPTool({ tool, input, githubToken, vercelToken, supabaseToken, cloudflareToken, awsAccessKeyId, awsSecretAccessKey, awsRegion, stripeToken, slackToken, notionToken, n8nApiKey, n8nBaseUrl, serverId }: MCPToolCallRequest): Promise<MCPToolCallResult> {
  const functionName = serverId;
  const body: Record<string, unknown> = { tool, input };

  if (serverId === 'mcp-github') {
    body.github_token = githubToken;
  } else if (serverId === 'mcp-vercel') {
    body.vercel_token = vercelToken;
  } else if (serverId === 'mcp-supabase') {
    body.supabase_token = supabaseToken;
  } else if (serverId === 'mcp-cloudflare') {
    body.cloudflare_token = cloudflareToken;
  } else if (serverId === 'mcp-aws') {
    body.aws_access_key_id = awsAccessKeyId;
    body.aws_secret_access_key = awsSecretAccessKey;
    body.aws_region = awsRegion || 'us-east-1';
  } else if (serverId === 'mcp-stripe') {
    body.stripe_token = stripeToken;
  } else if (serverId === 'mcp-slack') {
    body.slack_token = slackToken;
  } else if (serverId === 'mcp-notion') {
    body.notion_token = notionToken;
  } else if (serverId === 'mcp-n8n') {
    body.n8n_api_key = n8nApiKey;
    body.n8n_base_url = n8nBaseUrl;
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    return { ok: false, error: error.message };
  }

  return data as MCPToolCallResult;
}

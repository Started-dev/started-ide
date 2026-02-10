import { supabase } from '@/integrations/supabase/client';

export interface MCPToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
  githubToken?: string;
  vercelToken?: string;
  supabaseToken?: string;
  serverId: string;
}

export interface MCPToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export async function callMCPTool({ tool, input, githubToken, vercelToken, supabaseToken, serverId }: MCPToolCallRequest): Promise<MCPToolCallResult> {
  const functionName = serverId;
  const body: Record<string, unknown> = { tool, input };

  if (serverId === 'mcp-github') {
    body.github_token = githubToken;
  } else if (serverId === 'mcp-vercel') {
    body.vercel_token = vercelToken;
  } else if (serverId === 'mcp-supabase') {
    body.supabase_token = supabaseToken;
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    return { ok: false, error: error.message };
  }

  return data as MCPToolCallResult;
}

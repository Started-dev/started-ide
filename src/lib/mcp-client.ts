import { supabase } from '@/integrations/supabase/client';

export interface MCPToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
  githubToken: string;
}

export interface MCPToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export async function callMCPTool({ tool, input, githubToken }: MCPToolCallRequest): Promise<MCPToolCallResult> {
  const { data, error } = await supabase.functions.invoke('mcp-github', {
    body: { tool, input, github_token: githubToken },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return data as MCPToolCallResult;
}

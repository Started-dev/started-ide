import { useState } from 'react';
import { Plug, Check, X, Shield, ChevronRight, ChevronDown, Wrench, Key, Loader2, ExternalLink } from 'lucide-react';
import { MCPServer } from '@/types/agent';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { callMCPTool } from '@/lib/mcp-client';

interface MCPConfigProps {
  servers: MCPServer[];
  onToggleServer: (serverId: string) => void;
  onClose: () => void;
}

export function MCPConfig({ servers, onToggleServer, onClose }: MCPConfigProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSaveToken = () => {
    if (!githubToken.trim()) return;
    sessionStorage.setItem('github_pat', githubToken);
    setTokenSaved(true);
    // Auto-enable the GitHub server
    const ghServer = servers.find(s => s.id === 'mcp-github');
    if (ghServer && !ghServer.enabled) {
      onToggleServer('mcp-github');
    }
  };

  const handleTestTool = async (toolName: string) => {
    const token = sessionStorage.getItem('github_pat') || githubToken;
    if (!token) {
      setTestResult({ ok: false, message: 'No GitHub token configured' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callMCPTool({
        tool: toolName,
        input: toolName === 'github_list_repos' ? { per_page: 5 } : {},
        githubToken: token,
      });
      if (result.ok) {
        const count = Array.isArray(result.result) ? result.result.length : 1;
        setTestResult({ ok: true, message: `✓ ${toolName} returned ${count} result(s)` });
      } else {
        setTestResult({ ok: false, message: result.error || 'Unknown error' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Failed' });
    }
    setTesting(false);
  };

  const savedToken = sessionStorage.getItem('github_pat');
  const hasToken = tokenSaved || !!savedToken;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">MCP Servers</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Server list */}
        <div className="max-h-[450px] overflow-auto p-2 space-y-1">
          {servers.map(server => {
            const isExpanded = expandedId === server.id;
            const isGitHub = server.id === 'mcp-github';
            return (
              <div key={server.id} className="border border-border rounded-md overflow-hidden">
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : server.id)}
                >
                  <span className="text-lg">{server.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{server.name}</span>
                      {isGitHub && hasToken && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-ide-success/10 text-ide-success rounded-sm flex items-center gap-0.5">
                          <Key className="h-2.5 w-2.5" />
                          Token set
                        </span>
                      )}
                      {server.requiresAuth && !hasToken && isGitHub && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-ide-warning/10 text-ide-warning rounded-sm flex items-center gap-0.5">
                          <Shield className="h-2.5 w-2.5" />
                          Auth needed
                        </span>
                      )}
                      {!isGitHub && server.requiresAuth && !server.authConfigured && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-ide-warning/10 text-ide-warning rounded-sm flex items-center gap-0.5">
                          <Shield className="h-2.5 w-2.5" />
                          Auth needed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{server.description}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onToggleServer(server.id); }}
                    className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                      server.enabled
                        ? 'bg-ide-success/10 text-ide-success hover:bg-ide-success/20'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {server.enabled ? (
                      <span className="flex items-center gap-1"><Check className="h-3 w-3" /> On</span>
                    ) : 'Off'}
                  </button>
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>

                {isExpanded && (
                  <div className="px-3 pb-2.5 pt-0 border-t border-border">
                    {/* GitHub token config */}
                    {isGitHub && (
                      <div className="mt-2 mb-3 space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          GitHub Personal Access Token
                        </label>
                        <div className="flex gap-1.5">
                          <Input
                            type="password"
                            placeholder={hasToken ? '••••••••••••' : 'ghp_xxxxxxxxxxxx'}
                            value={githubToken}
                            onChange={e => setGithubToken(e.target.value)}
                            className="h-7 text-xs bg-background font-mono"
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveToken}
                            disabled={!githubToken.trim()}
                            className="h-7 text-xs px-2.5"
                          >
                            Save
                          </Button>
                        </div>
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo,read:user"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          Generate a token on GitHub <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    )}

                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-2 mb-1">
                      Available Tools ({server.tools.length})
                    </div>
                    <div className="space-y-1">
                      {server.tools.map(tool => (
                        <div key={tool.name} className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-sm group">
                          <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-mono text-foreground">{tool.name}</span>
                            <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
                          </div>
                          {isGitHub && hasToken && (
                            <button
                              onClick={() => handleTestTool(tool.name)}
                              disabled={testing}
                              className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-sm hover:bg-primary/20 transition-all"
                            >
                              {testing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Test'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Test result */}
                    {testResult && (
                      <div className={`mt-2 text-[10px] px-2 py-1.5 rounded-sm ${
                        testResult.ok ? 'bg-ide-success/10 text-ide-success' : 'bg-destructive/10 text-destructive'
                      }`}>
                        {testResult.message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            MCP servers extend Claude's capabilities. Tokens are stored in your browser session only.
          </p>
        </div>
      </div>
    </div>
  );
}

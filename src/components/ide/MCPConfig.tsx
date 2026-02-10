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

const TOKEN_CONFIG: Record<string, { storageKey: string; label: string; placeholder: string; generateUrl: string; generateLabel: string; secondaryKey?: string; secondaryLabel?: string; secondaryPlaceholder?: string; regionKey?: string }> = {
  'mcp-github': {
    storageKey: 'github_pat',
    label: 'GitHub Personal Access Token',
    placeholder: 'ghp_xxxxxxxxxxxx',
    generateUrl: 'https://github.com/settings/tokens/new?scopes=repo,read:user',
    generateLabel: 'Generate a token on GitHub',
  },
  'mcp-vercel': {
    storageKey: 'vercel_token',
    label: 'Vercel Access Token',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://vercel.com/account/tokens',
    generateLabel: 'Create a token on Vercel',
  },
  'mcp-supabase': {
    storageKey: 'supabase_access_token',
    label: 'Supabase Access Token',
    placeholder: 'sbp_xxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://supabase.com/dashboard/account/tokens',
    generateLabel: 'Generate a token on Supabase',
  },
  'mcp-cloudflare': {
    storageKey: 'cloudflare_api_token',
    label: 'Cloudflare API Token',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    generateLabel: 'Create a token on Cloudflare',
  },
  'mcp-aws': {
    storageKey: 'aws_access_key_id',
    label: 'AWS Access Key ID',
    placeholder: 'AKIAIOSFODNN7EXAMPLE',
    generateUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
    generateLabel: 'Create access keys in AWS Console',
    secondaryKey: 'aws_secret_access_key',
    secondaryLabel: 'AWS Secret Access Key',
    secondaryPlaceholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    regionKey: 'aws_region',
  },
  'mcp-stripe': {
    storageKey: 'stripe_secret_key',
    label: 'Stripe Secret Key',
    placeholder: 'sk_live_xxxxxxxxxxxx or sk_test_xxxxxxxxxxxx',
    generateUrl: 'https://dashboard.stripe.com/apikeys',
    generateLabel: 'Get API keys from Stripe Dashboard',
  },
  'mcp-slack': {
    storageKey: 'slack_bot_token',
    label: 'Slack Bot Token',
    placeholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx',
    generateUrl: 'https://api.slack.com/apps',
    generateLabel: 'Create a Slack app and get Bot Token',
  },
  'mcp-notion': {
    storageKey: 'notion_integration_token',
    label: 'Notion Integration Token',
    placeholder: 'ntn_xxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://www.notion.so/my-integrations',
    generateLabel: 'Create an integration on Notion',
  },
  'mcp-n8n': {
    storageKey: 'n8n_api_key',
    label: 'n8n API Key',
    placeholder: 'n8n_api_xxxxxxxxxxxx',
    generateUrl: 'https://docs.n8n.io/api/authentication/',
    generateLabel: 'Generate an API key in n8n Settings',
    secondaryKey: 'n8n_base_url',
    secondaryLabel: 'n8n Instance URL',
    secondaryPlaceholder: 'https://your-instance.app.n8n.cloud',
  },
  'mcp-telegram': {
    storageKey: 'telegram_bot_token',
    label: 'Telegram Bot Token',
    placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    generateUrl: 'https://t.me/BotFather',
    generateLabel: 'Create a bot with @BotFather',
  },
  'mcp-google-sheets': {
    storageKey: 'google_api_key',
    label: 'Google API Key / OAuth Token',
    placeholder: 'AIzaSy... or ya29.a0...',
    generateUrl: 'https://console.cloud.google.com/apis/credentials',
    generateLabel: 'Create credentials in Google Cloud Console',
  },
  'mcp-alpha-vantage': {
    storageKey: 'alpha_vantage_key',
    label: 'Alpha Vantage API Key',
    placeholder: 'xxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://www.alphavantage.co/support/#api-key',
    generateLabel: 'Get a free API key',
  },
  'mcp-coinmarketcap': {
    storageKey: 'cmc_api_key',
    label: 'CoinMarketCap API Key',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    generateUrl: 'https://coinmarketcap.com/api/',
    generateLabel: 'Get an API key from CoinMarketCap',
  },
  'mcp-huggingface': {
    storageKey: 'hf_token',
    label: 'Hugging Face Token',
    placeholder: 'hf_xxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://huggingface.co/settings/tokens',
    generateLabel: 'Create a token on Hugging Face',
  },
  'mcp-docker': {
    storageKey: 'docker_host',
    label: 'Docker Host URL',
    placeholder: 'http://localhost:2375',
    generateUrl: 'https://docs.docker.com/engine/api/',
    generateLabel: 'Docker Engine API docs',
    secondaryKey: 'docker_api_key',
    secondaryLabel: 'Docker API Key (optional)',
    secondaryPlaceholder: 'Optional bearer token',
  },
  'mcp-postgres': {
    storageKey: 'postgres_url',
    label: 'PostgreSQL Connection URL',
    placeholder: 'postgresql://user:pass@host:5432/dbname',
    generateUrl: 'https://www.postgresql.org/docs/current/libpq-connect.html',
    generateLabel: 'PostgreSQL connection docs',
  },
  'mcp-digitalocean': {
    storageKey: 'do_token',
    label: 'DigitalOcean API Token',
    placeholder: 'dop_v1_xxxxxxxxxxxxxxxxxxxx',
    generateUrl: 'https://cloud.digitalocean.com/account/api/tokens',
    generateLabel: 'Generate a token on DigitalOcean',
  },
  'mcp-twitter': {
    storageKey: 'twitter_bearer_token',
    label: 'X (Twitter) Bearer Token',
    placeholder: 'AAAAAAAAAAAAAAAAAAAAAxxxxxxx',
    generateUrl: 'https://developer.x.com/en/portal/dashboard',
    generateLabel: 'Get credentials from X Developer Portal',
  },
  'mcp-linkedin': {
    storageKey: 'linkedin_token',
    label: 'LinkedIn Access Token',
    placeholder: 'AQVxxxxxxxxxxxxxxxx',
    generateUrl: 'https://www.linkedin.com/developers/apps',
    generateLabel: 'Create an app on LinkedIn Developer',
  },
};

export function MCPConfig({ servers, onToggleServer, onClose }: MCPConfigProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const hasToken = (serverId: string) => {
    const cfg = TOKEN_CONFIG[serverId];
    if (!cfg) return false;
    if (cfg.secondaryKey) {
      return (savedFlags[serverId] || !!sessionStorage.getItem(cfg.storageKey)) && !!sessionStorage.getItem(cfg.secondaryKey);
    }
    return savedFlags[serverId] || !!sessionStorage.getItem(cfg.storageKey);
  };

  const handleSaveToken = (serverId: string) => {
    const cfg = TOKEN_CONFIG[serverId];
    const val = tokenInputs[serverId]?.trim();
    if (!cfg || !val) return;
    sessionStorage.setItem(cfg.storageKey, val);
    if (cfg.secondaryKey) {
      const secondaryVal = tokenInputs[`${serverId}_secondary`]?.trim();
      if (secondaryVal) sessionStorage.setItem(cfg.secondaryKey, secondaryVal);
    }
    if (cfg.regionKey) {
      const regionVal = tokenInputs[`${serverId}_region`]?.trim();
      if (regionVal) sessionStorage.setItem(cfg.regionKey, regionVal);
    }
    setSavedFlags(p => ({ ...p, [serverId]: true }));
    const server = servers.find(s => s.id === serverId);
    if (server && !server.enabled) onToggleServer(serverId);
  };

  const handleTestTool = async (serverId: string, toolName: string) => {
    const cfg = TOKEN_CONFIG[serverId];
    if (!cfg) return;
    const token = sessionStorage.getItem(cfg.storageKey) || tokenInputs[serverId];
    if (!token) { setTestResult({ ok: false, message: 'No token configured' }); return; }

    setTesting(true);
    setTestResult(null);
    try {
      const defaultInput = serverId === 'mcp-github' && toolName === 'github_list_repos'
        ? { per_page: 5 }
        : serverId === 'mcp-vercel' && toolName === 'vercel_list_projects'
          ? { limit: 5 }
          : serverId === 'mcp-supabase' && toolName === 'supabase_list_projects'
            ? {}
            : {};
      const secondaryVal = cfg.secondaryKey ? (sessionStorage.getItem(cfg.secondaryKey) || tokenInputs[`${serverId}_secondary`]) : undefined;
      const regionVal = cfg.regionKey ? (sessionStorage.getItem(cfg.regionKey) || 'us-east-1') : undefined;
      const result = await callMCPTool({
        tool: toolName,
        input: defaultInput,
        serverId,
        githubToken: serverId === 'mcp-github' ? token : undefined,
        vercelToken: serverId === 'mcp-vercel' ? token : undefined,
        supabaseToken: serverId === 'mcp-supabase' ? token : undefined,
        cloudflareToken: serverId === 'mcp-cloudflare' ? token : undefined,
        awsAccessKeyId: serverId === 'mcp-aws' ? token : undefined,
        awsSecretAccessKey: serverId === 'mcp-aws' ? secondaryVal : undefined,
        awsRegion: serverId === 'mcp-aws' ? regionVal : undefined,
        stripeToken: serverId === 'mcp-stripe' ? token : undefined,
        slackToken: serverId === 'mcp-slack' ? token : undefined,
        notionToken: serverId === 'mcp-notion' ? token : undefined,
        n8nApiKey: serverId === 'mcp-n8n' ? token : undefined,
        n8nBaseUrl: serverId === 'mcp-n8n' ? secondaryVal : undefined,
        telegramBotToken: serverId === 'mcp-telegram' ? token : undefined,
        googleApiKey: serverId === 'mcp-google-sheets' ? token : undefined,
        alphaVantageKey: serverId === 'mcp-alpha-vantage' ? token : undefined,
        cmcApiKey: serverId === 'mcp-coinmarketcap' ? token : undefined,
        hfToken: serverId === 'mcp-huggingface' ? token : undefined,
        dockerHost: serverId === 'mcp-docker' ? token : undefined,
        dockerApiKey: serverId === 'mcp-docker' ? secondaryVal : undefined,
        postgresUrl: serverId === 'mcp-postgres' ? token : undefined,
        doToken: serverId === 'mcp-digitalocean' ? token : undefined,
        twitterBearerToken: serverId === 'mcp-twitter' ? token : undefined,
        linkedinToken: serverId === 'mcp-linkedin' ? token : undefined,
      });
      if (result.ok) {
        const r = result.result as Record<string, unknown>;
        const items = Array.isArray(r) ? r : Array.isArray(r?.projects) ? r.projects : Array.isArray(r?.deployments) ? r.deployments : [r];
        setTestResult({ ok: true, message: `✓ ${toolName} returned ${items.length} result(s)` });
      } else {
        setTestResult({ ok: false, message: result.error || 'Unknown error' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Failed' });
    }
    setTesting(false);
  };

  const isAuthServer = (serverId: string) => !!TOKEN_CONFIG[serverId];
  const noAuthNeeded = (serverId: string) => {
    const s = servers.find(s => s.id === serverId);
    return s && !s.requiresAuth;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">MCP Servers</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="max-h-[450px] overflow-auto p-2 space-y-1">
          {servers.map(server => {
            const isExpanded = expandedId === server.id;
            const isAuth = isAuthServer(server.id);
            const cfg = TOKEN_CONFIG[server.id];
            const serverHasToken = hasToken(server.id);

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
                      {isAuth && serverHasToken && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-ide-success/10 text-ide-success rounded-sm flex items-center gap-0.5">
                          <Key className="h-2.5 w-2.5" /> Token set
                        </span>
                      )}
                      {isAuth && !serverHasToken && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-ide-warning/10 text-ide-warning rounded-sm flex items-center gap-0.5">
                          <Shield className="h-2.5 w-2.5" /> Auth needed
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
                    {server.enabled ? <span className="flex items-center gap-1"><Check className="h-3 w-3" /> On</span> : 'Off'}
                  </button>
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="px-3 pb-2.5 pt-0 border-t border-border">
                    {cfg && (
                      <div className="mt-2 mb-3 space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          {cfg.label}
                        </label>
                        <div className="flex gap-1.5">
                          <Input
                            type="password"
                            placeholder={serverHasToken ? '••••••••••••' : cfg.placeholder}
                            value={tokenInputs[server.id] || ''}
                            onChange={e => setTokenInputs(p => ({ ...p, [server.id]: e.target.value }))}
                            className="h-7 text-xs bg-background font-mono"
                          />
                          {!cfg.secondaryKey && (
                            <Button
                              size="sm"
                              onClick={() => handleSaveToken(server.id)}
                              disabled={!tokenInputs[server.id]?.trim()}
                              className="h-7 text-xs px-2.5"
                            >
                              Save
                            </Button>
                          )}
                        </div>
                        {cfg.secondaryKey && cfg.secondaryLabel && (
                          <>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                              {cfg.secondaryLabel}
                            </label>
                            <Input
                              type="password"
                              placeholder={serverHasToken ? '••••••••••••' : cfg.secondaryPlaceholder}
                              value={tokenInputs[`${server.id}_secondary`] || ''}
                              onChange={e => setTokenInputs(p => ({ ...p, [`${server.id}_secondary`]: e.target.value }))}
                              className="h-7 text-xs bg-background font-mono"
                            />
                          </>
                        )}
                        {cfg.regionKey && (
                          <>
                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                              Region
                            </label>
                            <Input
                              type="text"
                              placeholder="us-east-1"
                              value={tokenInputs[`${server.id}_region`] || ''}
                              onChange={e => setTokenInputs(p => ({ ...p, [`${server.id}_region`]: e.target.value }))}
                              className="h-7 text-xs bg-background font-mono"
                            />
                          </>
                        )}
                        {cfg.secondaryKey && (
                          <Button
                            size="sm"
                            onClick={() => handleSaveToken(server.id)}
                            disabled={!tokenInputs[server.id]?.trim() || !tokenInputs[`${server.id}_secondary`]?.trim()}
                            className="h-7 text-xs px-2.5 w-full"
                          >
                            Save Credentials
                          </Button>
                        )}
                        <a
                          href={cfg.generateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          {cfg.generateLabel} <ExternalLink className="h-2.5 w-2.5" />
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
                          {(noAuthNeeded(server.id) || (isAuth && serverHasToken)) && (
                            <button
                              onClick={() => handleTestTool(server.id, tool.name)}
                              disabled={testing}
                              className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-sm hover:bg-primary/20 transition-all"
                            >
                              {testing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Test'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

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

        <div className="px-4 py-2.5 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            MCP servers extend Started's capabilities. Tokens are stored in your browser session only.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Rocket, AlertTriangle, CheckCircle2, XCircle, Clock, Globe, Zap, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface Deployment {
  id: string;
  command: string;
  status: string;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  createdAt: Date;
}

interface HookExec {
  id: string;
  hookId: string | null;
  event: string;
  status: string;
  durationMs: number;
  inputPayload: Record<string, unknown>;
  outputPayload: Record<string, unknown>;
  createdAt: Date;
}

interface CICDPanelProps {
  projectId: string;
  onClose: () => void;
}

const DEPLOY_PATTERNS = [
  /^(npm|yarn|pnpm|bun)\s+(run\s+)?(build|deploy|publish)/,
  /^(vercel|netlify|firebase)\s+(deploy|publish)/,
  /^docker\s+(build|push|compose\s+up)/,
  /^git\s+push/,
  /^kubectl\s+(apply|rollout)/,
  /^terraform\s+apply/,
  /^make\s+(deploy|build|release)/,
];

export function CICDPanel({ projectId, onClose }: CICDPanelProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [hookExecs, setHookExecs] = useState<HookExec[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [runsRes, execsRes] = await Promise.all([
      supabase
        .from('runs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('hook_execution_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (runsRes.data) {
      setDeployments(runsRes.data.map(r => ({
        id: r.id,
        command: r.command,
        status: r.status,
        exitCode: r.exit_code,
        stdout: r.stdout,
        stderr: r.stderr,
        createdAt: new Date(r.created_at),
      })));
    }

    if (execsRes.data) {
      setHookExecs(execsRes.data.map(r => ({
        id: r.id,
        hookId: r.hook_id,
        event: r.event,
        status: r.status,
        durationMs: r.duration_ms ?? 0,
        inputPayload: (r.input_payload as Record<string, unknown>) || {},
        outputPayload: (r.output_payload as Record<string, unknown>) || {},
        createdAt: new Date(r.created_at),
      })));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const deployRuns = deployments.filter(d =>
    DEPLOY_PATTERNS.some(p => p.test(d.command.trim()))
  );
  const allRuns = deployments;

  const webhookExecs = hookExecs.filter(e => e.event === 'Webhook');
  const eventExecs = hookExecs.filter(e => ['OnDeploy', 'OnFileChange', 'OnError'].includes(e.event));

  const filteredWebhookExecs = filter === 'all' ? webhookExecs : webhookExecs.filter(e => e.status === filter);
  const filteredEventExecs = filter === 'all' ? eventExecs : eventExecs.filter(e => e.status === filter);

  const successCount = hookExecs.filter(e => e.status === 'success').length;
  const failedCount = hookExecs.filter(e => e.status === 'failed').length;
  const avgDuration = hookExecs.length > 0
    ? Math.round(hookExecs.reduce((sum, e) => sum + e.durationMs, 0) / hookExecs.length)
    : 0;

  const statusIcon = (status: string, exitCode?: number | null) => {
    if (status === 'success' || (status === 'completed' && exitCode === 0)) return <CheckCircle2 className="h-3.5 w-3.5 text-ide-success" />;
    if (status === 'failed' || (exitCode !== null && exitCode !== undefined && exitCode !== 0)) return <XCircle className="h-3.5 w-3.5 text-ide-error" />;
    if (status === 'running' || status === 'pending') return <Clock className="h-3.5 w-3.5 text-ide-warning animate-pulse" />;
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">CI/CD Pipeline</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} disabled={loading} className="p-1 hover:bg-muted rounded-sm" title="Refresh">
              <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs">
            <Rocket className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground">Deploys:</span>
            <span className="font-medium text-foreground">{deployRuns.length}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="h-3 w-3 text-ide-success" />
            <span className="text-muted-foreground">Success:</span>
            <span className="font-medium text-foreground">{successCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <XCircle className="h-3 w-3 text-ide-error" />
            <span className="text-muted-foreground">Failed:</span>
            <span className="font-medium text-foreground">{failedCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Avg:</span>
            <span className="font-medium text-foreground">{avgDuration}ms</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as 'all' | 'success' | 'failed')}
              className="bg-input text-foreground text-[10px] px-1.5 py-0.5 rounded-sm border border-border outline-none"
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="deployments" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-9 px-2">
            <TabsTrigger value="deployments" className="text-xs data-[state=active]:bg-muted gap-1">
              <Rocket className="h-3 w-3" /> Deployments
            </TabsTrigger>
            <TabsTrigger value="hooks" className="text-xs data-[state=active]:bg-muted gap-1">
              <Zap className="h-3 w-3" /> Hook Timeline
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs data-[state=active]:bg-muted gap-1">
              <Globe className="h-3 w-3" /> Webhook Delivery
            </TabsTrigger>
          </TabsList>

          {/* Deployments Tab */}
          <TabsContent value="deployments" className="mt-0">
            <div className="max-h-[380px] overflow-auto">
              {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>}
              {!loading && allRuns.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No runs recorded yet. Run a command to get started.</p>
              )}
              {!loading && allRuns.map(run => {
                const isDeploy = DEPLOY_PATTERNS.some(p => p.test(run.command.trim()));
                return (
                  <div key={run.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors">
                    {statusIcon(run.status, run.exitCode)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-foreground truncate">{run.command}</code>
                        {isDeploy && (
                          <span className="text-[9px] px-1 py-0.5 bg-primary/10 text-primary rounded-sm shrink-0">deploy</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{timeAgo(run.createdAt)}</span>
                        {run.exitCode !== null && (
                          <span className={`text-[10px] ${run.exitCode === 0 ? 'text-ide-success' : 'text-ide-error'}`}>
                            exit {run.exitCode}
                          </span>
                        )}
                        <span className={`text-[10px] px-1 py-0.5 rounded-sm ${
                          run.status === 'completed' ? 'bg-ide-success/10 text-ide-success' :
                          run.status === 'failed' ? 'bg-ide-error/10 text-ide-error' :
                          'bg-muted text-muted-foreground'
                        }`}>{run.status}</span>
                      </div>
                      {run.stderr && (
                        <pre className="text-[10px] text-ide-error/80 font-mono mt-1 truncate max-w-full">{run.stderr.slice(0, 120)}</pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Hook Timeline Tab */}
          <TabsContent value="hooks" className="mt-0">
            <div className="max-h-[380px] overflow-auto">
              {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>}
              {!loading && filteredEventExecs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No hook executions yet. Configure event hooks to see activity.</p>
              )}
              {!loading && filteredEventExecs.map(exec => (
                <div key={exec.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {exec.status === 'success'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-ide-success mt-0.5" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-ide-error mt-0.5" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                        exec.event === 'OnDeploy' ? 'bg-primary/10 text-primary' :
                        exec.event === 'OnError' ? 'bg-ide-error/10 text-ide-error' :
                        'bg-muted text-muted-foreground'
                      }`}>{exec.event}</span>
                      <span className="text-[10px] text-muted-foreground">{exec.durationMs}ms</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(exec.createdAt)}</span>
                    </div>
                    {Object.keys(exec.outputPayload).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground font-mono mt-1 truncate">
                        {JSON.stringify(exec.outputPayload).slice(0, 100)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Webhook Delivery Tab */}
          <TabsContent value="webhooks" className="mt-0">
            <div className="max-h-[380px] overflow-auto">
              {loading && <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>}
              {!loading && filteredWebhookExecs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No webhook deliveries yet. Send a test webhook to see results.</p>
              )}
              {!loading && filteredWebhookExecs.map(exec => (
                <div key={exec.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {exec.status === 'success'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-ide-success mt-0.5" />
                    : <XCircle className="h-3.5 w-3.5 text-ide-error mt-0.5" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-medium">
                        <Globe className="h-2.5 w-2.5 inline mr-0.5" />
                        Webhook
                      </span>
                      <span className={`text-[10px] px-1 py-0.5 rounded-sm ${
                        exec.status === 'success' ? 'bg-ide-success/10 text-ide-success' : 'bg-ide-error/10 text-ide-error'
                      }`}>{exec.status}</span>
                      <span className="text-[10px] text-muted-foreground">{exec.durationMs}ms</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(exec.createdAt)}</span>
                    </div>
                    <pre className="text-[10px] text-muted-foreground font-mono mt-1 truncate">
                      {JSON.stringify(exec.inputPayload).slice(0, 120)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            {hookExecs.length} hook executions · {allRuns.length} runs
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Cloud, Rocket, ListTodo, Puzzle, RefreshCw, Loader2, CheckCircle, AlertCircle, Trash2, Download, Copy, ExternalLink, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIDE } from '@/contexts/IDEContext';
import { toast } from '@/hooks/use-toast';

interface OpenClawPanelProps {
  onClose: () => void;
}

type Tab = 'install' | 'status' | 'deploy' | 'tasks' | 'skills';

interface OpenClawConfig {
  url: string;
  apiKey: string;
}

interface Installation {
  id: string;
  project_id: string;
  slug: string;
  instance_url: string;
  status: string;
  logs: string | null;
  created_at: string;
  completed_at: string | null;
}

function getConfig(): OpenClawConfig {
  return {
    url: localStorage.getItem('openclaw_url') || '',
    apiKey: localStorage.getItem('openclaw_api_key') || '',
  };
}

function saveConfig(cfg: OpenClawConfig) {
  localStorage.setItem('openclaw_url', cfg.url);
  localStorage.setItem('openclaw_api_key', cfg.apiKey);
}

async function callOpenClaw(tool: string, input?: Record<string, unknown>) {
  const cfg = getConfig();
  if (!cfg.url || !cfg.apiKey) throw new Error('OpenClaw not configured');
  const { data, error } = await supabase.functions.invoke('mcp-openclaw', {
    body: { tool, input, openclaw_url: cfg.url, openclaw_api_key: cfg.apiKey },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Unknown error');
  return data.result;
}

/* ─── Install Wizard ─── */
function InstallWizard({ projectId, onConnected }: { projectId: string; onConnected: (url: string, key: string) => void }) {
  const [step, setStep] = useState(1);
  const [llmKey, setLlmKey] = useState('');
  const [useGateway, setUseGateway] = useState(true);
  const [installId, setInstallId] = useState<string | null>(null);
  const [installStatus, setInstallStatus] = useState<string>('');
  const [logs, setLogs] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const startInstall = async () => {
    const key = useGateway ? 'lovable-gateway' : llmKey;
    if (!key) { toast({ title: 'Enter an LLM key or use the gateway', variant: 'destructive' }); return; }
    setInstalling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('install-openclaw', {
        body: { llm_key: key, project_id: projectId },
      });
      if (res.error) throw new Error(res.error.message);
      const d = res.data;
      if (!d?.ok) throw new Error(d?.error || 'Install failed');
      setInstallId(d.install_id);
      setInstanceUrl(d.instance_url);
      setInstallStatus('installing');
      setStep(2);
      // Start polling
      pollRef.current = setInterval(() => pollStatus(d.install_id), 10000);
    } catch (e: any) {
      toast({ title: 'Install error', description: e.message, variant: 'destructive' });
    } finally {
      setInstalling(false);
    }
  };

  const pollStatus = useCallback(async (id: string) => {
    try {
      const { data } = await supabase.functions.invoke('install-openclaw', {
        body: { _method: 'GET', install_id: id },
      });
      if (data?.logs) setLogs(data.logs);
      if (data?.status) setInstallStatus(data.status);
      if (data?.instance_url) setInstanceUrl(data.instance_url);
      if (data?.status === 'completed' || data?.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        if (data.status === 'completed') setStep(3);
      }
    } catch { /* silent */ }
  }, []);

  const handleConnect = () => {
    onConnected(instanceUrl, installId || '');
    toast({ title: '✅ OpenClaw connected!' });
  };

  return (
    <div className="space-y-4">
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              step === s ? 'border-primary bg-primary text-primary-foreground' :
              step > s ? 'border-primary bg-primary/20 text-primary' :
              'border-muted-foreground/30 text-muted-foreground'
            }`}>
              {step > s ? <CheckCircle className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
        <span className="text-[10px] text-muted-foreground ml-2">
          {step === 1 ? 'Configure' : step === 2 ? 'Installing...' : 'Complete'}
        </span>
      </div>

      {/* Step 1: LLM Key */}
      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold">Step 1: Configure LLM Key</h3>
          <p className="text-[11px] text-muted-foreground">
            MoltBot needs an LLM API key. You can use Started's built-in AI gateway (recommended) or provide your own.
          </p>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={useGateway}
              onChange={(e) => setUseGateway(e.target.checked)}
              className="rounded border-border"
            />
            Use Started AI Gateway (recommended)
          </label>
          {!useGateway && (
            <input
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              placeholder="sk-... or your LLM API key"
              type="password"
              className="w-full text-xs px-3 py-2 bg-input border border-border rounded-md"
            />
          )}
          <button
            onClick={startInstall}
            disabled={installing || (!useGateway && !llmKey)}
            className="flex items-center gap-2 px-4 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {installing ? 'Starting...' : 'Install MoltBot'}
          </button>
        </div>
      )}

      {/* Step 2: Installing */}
      {step === 2 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold">Step 2: Installing MoltBot</h3>
          <p className="text-[11px] text-muted-foreground">
            Installation is running in the background. This may take 5+ minutes. Polling every 10 seconds...
          </p>
          <div className="flex items-center gap-2 text-xs">
            {installStatus === 'installing' ? (
              <><Loader2 className="h-3 w-3 animate-spin text-primary" /> Installing...</>
            ) : installStatus === 'failed' ? (
              <><AlertCircle className="h-3 w-3 text-destructive" /> Failed</>
            ) : (
              <><CheckCircle className="h-3 w-3 text-green-500" /> Complete</>
            )}
          </div>
          {/* Live log viewer */}
          <pre
            ref={logRef}
            className="text-[10px] bg-muted p-3 rounded-md overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap"
          >
            {logs || 'Waiting for logs...'}
          </pre>
          {installStatus === 'failed' && (
            <button
              onClick={() => { setStep(1); setInstallStatus(''); setLogs(''); }}
              className="text-xs text-primary hover:underline"
            >
              ← Try Again
            </button>
          )}
        </div>
      )}

      {/* Step 3: Complete */}
      {step === 3 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" /> MoltBot Installed!
          </h3>
          <div className="bg-muted p-3 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Instance URL</span>
              <button
                onClick={() => { navigator.clipboard.writeText(instanceUrl); toast({ title: 'Copied!' }); }}
                className="p-1 hover:bg-background rounded"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <code className="text-[11px] block break-all">{instanceUrl}</code>
          </div>
          <a
            href="https://emergent.sh/tutorial/moltbot-on-emergent"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> MoltBot Tutorial & Next Steps
          </a>
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <CheckCircle className="h-3 w-3" /> Connect & Continue
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Panel ─── */
export function OpenClawPanel({ onClose }: OpenClawPanelProps) {
  const { files, project } = useIDE();
  const [tab, setTab] = useState<Tab>('install');
  const [config, setConfig] = useState<OpenClawConfig>(getConfig);
  const [configured, setConfigured] = useState(!!config.url && !!config.apiKey);

  // Status
  const [status, setStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Deploy
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<any>(null);

  // Tasks
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Skills
  const [skills, setSkills] = useState<any[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  // Check existing installation
  const [existingInstall, setExistingInstall] = useState<Installation | null>(null);

  useEffect(() => {
    checkExistingInstallation();
  }, []);

  const checkExistingInstallation = async () => {
    try {
      const res = await supabase.functions.invoke('install-openclaw', {
        body: { _method: 'GET' },
      });
      const installations = res.data?.installations;
      if (installations?.length > 0) {
        const latest = installations[0];
        setExistingInstall(latest);
        if (latest.status === 'completed' && latest.instance_url) {
          // Auto-connect if not already configured
          if (!configured) {
            setConfig({ url: latest.instance_url, apiKey: latest.slug });
            saveConfig({ url: latest.instance_url, apiKey: latest.slug });
            setConfigured(true);
            setTab('status');
          }
        }
      }
    } catch { /* no installations */ }
  };

  const handleSaveConfig = () => {
    saveConfig(config);
    setConfigured(true);
    setTab('status');
    toast({ title: 'OpenClaw configured' });
  };

  const handleInstallConnected = (url: string, key: string) => {
    setConfig({ url, apiKey: key });
    saveConfig({ url, apiKey: key });
    setConfigured(true);
    setTab('status');
  };

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await callOpenClaw('openclaw_status');
      setStatus(res);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await callOpenClaw('openclaw_list_tasks', { limit: 20 });
      setTasks(Array.isArray(res) ? res : res?.tasks || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setTasksLoading(false);
    }
  };

  const fetchSkills = async () => {
    setSkillsLoading(true);
    try {
      const res = await callOpenClaw('openclaw_list_skills');
      setSkills(Array.isArray(res) ? res : res?.skills || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSkillsLoading(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployResult(null);
    try {
      const projectFiles = files.filter(f => !f.isFolder).map(f => ({ path: f.path, content: f.content }));
      const res = await callOpenClaw('openclaw_mcp_invoke', {
        mcp_tool: 'deploy_project',
        mcp_input: { files: projectFiles },
      });
      setDeployResult(res);
      toast({ title: '🚀 Deployed to OpenClaw!' });
    } catch (e: any) {
      setDeployResult({ error: e.message });
      toast({ title: 'Deploy failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeploying(false);
    }
  };

  const cancelTask = async (taskId: string) => {
    try {
      await callOpenClaw('openclaw_cancel_task', { task_id: taskId });
      toast({ title: 'Task cancelled' });
      fetchTasks();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (configured && tab === 'status') fetchStatus();
    if (configured && tab === 'tasks') fetchTasks();
    if (configured && tab === 'skills') fetchSkills();
  }, [tab, configured]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'install', label: 'Install', icon: <Download className="h-3 w-3" /> },
    { id: 'status', label: 'Status', icon: <Cloud className="h-3 w-3" /> },
    { id: 'deploy', label: 'Deploy', icon: <Rocket className="h-3 w-3" /> },
    { id: 'tasks', label: 'Tasks', icon: <ListTodo className="h-3 w-3" /> },
    { id: 'skills', label: 'Skills', icon: <Puzzle className="h-3 w-3" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold">OpenClaw / MoltBot</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs transition-colors ${
                tab === t.id ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
          {configured && (
            <>
              <div className="flex-1" />
              <button onClick={() => { setConfigured(false); localStorage.removeItem('openclaw_url'); localStorage.removeItem('openclaw_api_key'); }} className="px-3 text-[10px] text-muted-foreground hover:text-destructive">
                Disconnect
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Install Tab */}
          {tab === 'install' && (
            <div>
              <InstallWizard
                projectId={project?.id || ''}
                onConnected={handleInstallConnected}
              />
              {/* Manual connect fallback */}
              <div className="mt-6 pt-4 border-t border-border">
                <p className="text-[11px] text-muted-foreground mb-2">Or connect to an existing instance:</p>
                <div className="space-y-2">
                  <input
                    value={config.url}
                    onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
                    placeholder="https://your-openclaw-instance.com"
                    className="w-full text-xs px-3 py-2 bg-input border border-border rounded-md"
                  />
                  <input
                    value={config.apiKey}
                    onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                    placeholder="API Key"
                    type="password"
                    className="w-full text-xs px-3 py-2 bg-input border border-border rounded-md"
                  />
                  <button onClick={handleSaveConfig} className="px-4 py-1.5 text-xs bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
                    Connect Manually
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Status Tab */}
          {tab === 'status' && !configured && (
            <p className="text-xs text-muted-foreground">Connect to an OpenClaw instance first via the Install tab.</p>
          )}
          {tab === 'status' && configured && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold">Instance Status</h3>
                <button onClick={fetchStatus} className="p-1 hover:bg-muted rounded-sm">
                  <RefreshCw className={`h-3 w-3 ${statusLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {status ? (
                <pre className="text-[11px] bg-muted p-3 rounded-md overflow-auto max-h-60">
                  {JSON.stringify(status, null, 2)}
                </pre>
              ) : statusLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
              ) : (
                <p className="text-xs text-muted-foreground">Click refresh to check status.</p>
              )}
            </div>
          )}

          {/* Deploy Tab */}
          {tab === 'deploy' && !configured && (
            <p className="text-xs text-muted-foreground">Connect to an OpenClaw instance first via the Install tab.</p>
          )}
          {tab === 'deploy' && configured && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Deploy all {files.filter(f => !f.isFolder).length} project files to your OpenClaw instance.
              </p>
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="flex items-center gap-2 px-4 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {deploying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                {deploying ? 'Deploying...' : 'Deploy Project'}
              </button>
              {deployResult && (
                <pre className="text-[11px] bg-muted p-3 rounded-md overflow-auto max-h-60">
                  {JSON.stringify(deployResult, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {tab === 'tasks' && !configured && (
            <p className="text-xs text-muted-foreground">Connect to an OpenClaw instance first via the Install tab.</p>
          )}
          {tab === 'tasks' && configured && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold">Autonomous Tasks</h3>
                <button onClick={fetchTasks} className="p-1 hover:bg-muted rounded-sm">
                  <RefreshCw className={`h-3 w-3 ${tasksLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {tasks.length > 0 ? tasks.map((t: any, i: number) => (
                <div key={t.id || i} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md text-xs">
                  {t.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin text-primary mt-0.5" /> :
                   t.status === 'completed' ? <CheckCircle className="h-3 w-3 text-green-500 mt-0.5" /> :
                   <AlertCircle className="h-3 w-3 text-muted-foreground mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{t.goal || t.title || 'Task'}</p>
                    <p className="text-muted-foreground">{t.status}</p>
                  </div>
                  {t.status === 'running' && (
                    <button onClick={() => cancelTask(t.id)} className="p-1 hover:bg-destructive/10 rounded-sm">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  )}
                </div>
              )) : (
                <p className="text-xs text-muted-foreground">{tasksLoading ? 'Loading...' : 'No tasks found.'}</p>
              )}
            </div>
          )}

          {/* Skills Tab */}
          {tab === 'skills' && !configured && (
            <p className="text-xs text-muted-foreground">Connect to an OpenClaw instance first via the Install tab.</p>
          )}
          {tab === 'skills' && configured && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold">Installed Skills</h3>
                <button onClick={fetchSkills} className="p-1 hover:bg-muted rounded-sm">
                  <RefreshCw className={`h-3 w-3 ${skillsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {skills.length > 0 ? skills.map((s: any, i: number) => (
                <div key={s.name || i} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-xs">
                  <Puzzle className="h-3 w-3 text-primary" />
                  <span className="font-medium">{s.name || s}</span>
                </div>
              )) : (
                <p className="text-xs text-muted-foreground">{skillsLoading ? 'Loading...' : 'No skills installed.'}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

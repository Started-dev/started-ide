import { useState, useEffect } from 'react';
import { X, Cloud, Rocket, ListTodo, Puzzle, RefreshCw, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIDE } from '@/contexts/IDEContext';
import { toast } from '@/hooks/use-toast';

interface OpenClawPanelProps {
  onClose: () => void;
}

type Tab = 'status' | 'deploy' | 'tasks' | 'skills';

interface OpenClawConfig {
  url: string;
  apiKey: string;
}

function getConfig(): OpenClawConfig {
  return {
    url: sessionStorage.getItem('openclaw_url') || '',
    apiKey: sessionStorage.getItem('openclaw_api_key') || '',
  };
}

function saveConfig(cfg: OpenClawConfig) {
  sessionStorage.setItem('openclaw_url', cfg.url);
  sessionStorage.setItem('openclaw_api_key', cfg.apiKey);
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

export function OpenClawPanel({ onClose }: OpenClawPanelProps) {
  const { files } = useIDE();
  const [tab, setTab] = useState<Tab>('status');
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

  const handleSaveConfig = () => {
    saveConfig(config);
    setConfigured(true);
    toast({ title: 'OpenClaw configured' });
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
            <h2 className="text-sm font-semibold">OpenClaw</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm"><X className="h-4 w-4" /></button>
        </div>

        {/* Connection setup */}
        {!configured && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Configure your OpenClaw instance to get started.</p>
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
            <button onClick={handleSaveConfig} className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
              Connect
            </button>
          </div>
        )}

        {configured && (
          <>
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
              <div className="flex-1" />
              <button onClick={() => { setConfigured(false); sessionStorage.clear(); }} className="px-3 text-[10px] text-muted-foreground hover:text-destructive">
                Disconnect
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {tab === 'status' && (
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

              {tab === 'deploy' && (
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

              {tab === 'tasks' && (
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
                       t.status === 'completed' ? <CheckCircle className="h-3 w-3 text-ide-success mt-0.5" /> :
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

              {tab === 'skills' && (
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
          </>
        )}
      </div>
    </div>
  );
}

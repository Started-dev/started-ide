import { useState } from 'react';
import { Anchor, X, Plus, Check, Trash2, Copy, RefreshCw, Zap, Globe, Bell, Send } from 'lucide-react';
import { Hook, HookEvent, HookAction, WebhookSecret, HookExecution } from '@/types/agent';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';

interface HooksConfigProps {
  hooks: Hook[];
  onToggleHook: (hookId: string) => void;
  onAddHook: (hook: Omit<Hook, 'id'>) => void;
  onRemoveHook: (hookId: string) => void;
  onClose: () => void;
  webhookSecrets?: WebhookSecret[];
  executions?: HookExecution[];
  onGenerateSecret?: (label: string) => Promise<WebhookSecret | null>;
  onDeleteSecret?: (id: string) => void;
  onRefreshExecutions?: () => void;
  webhookBaseUrl?: string;
  projectId?: string;
}

export function HooksConfig({
  hooks, onToggleHook, onAddHook, onRemoveHook, onClose,
  webhookSecrets = [], executions = [],
  onGenerateSecret, onDeleteSecret, onRefreshExecutions,
  webhookBaseUrl, projectId,
}: HooksConfigProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [addTab, setAddTab] = useState<'agent' | 'webhook' | 'event'>('agent');
  const [newEvent, setNewEvent] = useState<HookEvent>('PreToolUse');
  const [newTool, setNewTool] = useState('*');
  const [newCmd, setNewCmd] = useState('');
  const [newAction, setNewAction] = useState<HookAction>('deny');
  const [newLabel, setNewLabel] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [secretLabel, setSecretLabel] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);

  const agentHooks = hooks.filter(h => h.event === 'PreToolUse' || h.event === 'PostToolUse');
  const webhookHooks = hooks.filter(h => h.event === 'Webhook');
  const eventHooks = hooks.filter(h => ['OnDeploy', 'OnFileChange', 'OnError'].includes(h.event));

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAddHook({
      event: newEvent,
      toolPattern: newTool || '*',
      commandPattern: newCmd || undefined,
      action: newAction,
      label: newLabel.trim(),
      enabled: true,
      webhookUrl: newWebhookUrl || undefined,
    });
    setShowAdd(false);
    setNewLabel('');
    setNewCmd('');
    setNewWebhookUrl('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const testWebhook = async (secret: WebhookSecret) => {
    if (!webhookBaseUrl || !projectId) return;
    setTestingWebhook(true);
    try {
      const url = `${webhookBaseUrl}?project_id=${projectId}&token=${secret.token}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
      });
      const data = await resp.json();
      toast({ title: resp.ok ? 'Webhook test successful' : 'Webhook test failed', description: `Hooks triggered: ${data.hooks_triggered ?? 0}` });
      onRefreshExecutions?.();
    } catch (err) {
      toast({ title: 'Webhook test failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
    setTestingWebhook(false);
  };

  const renderHookRow = (hook: Hook) => (
    <div key={hook.id} className="flex items-center gap-2 px-3 py-2 border border-border rounded-md">
      <button
        onClick={() => onToggleHook(hook.id)}
        className={`w-5 h-5 flex items-center justify-center rounded-sm border transition-colors ${
          hook.enabled ? 'bg-ide-success/20 border-ide-success text-ide-success' : 'border-border text-muted-foreground'
        }`}
      >
        {hook.enabled && <Check className="h-3 w-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{hook.label}</span>
          <span className={`text-[10px] px-1 py-0.5 rounded-sm ${
            hook.action === 'deny' ? 'bg-ide-error/10 text-ide-error' :
            hook.action === 'allow' ? 'bg-ide-success/10 text-ide-success' :
            hook.action === 'webhook' ? 'bg-primary/10 text-primary' :
            hook.action === 'notify' ? 'bg-yellow-500/10 text-yellow-500' :
            'bg-muted text-muted-foreground'
          }`}>
            {hook.action}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          {hook.event} → {hook.toolPattern}{hook.commandPattern ? ` / ${hook.commandPattern}` : ''}
          {hook.webhookUrl ? ` → ${hook.webhookUrl}` : ''}
        </p>
      </div>
      <button
        onClick={() => onRemoveHook(hook.id)}
        className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-ide-error transition-colors"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );

  const renderAddForm = () => (
    <div className="px-4 py-3 border-t border-border space-y-2">
      <input
        value={newLabel}
        onChange={e => setNewLabel(e.target.value)}
        placeholder="Hook label..."
        className="w-full bg-input text-foreground text-xs px-2 py-1.5 rounded-sm border border-border outline-none focus:border-primary"
        autoFocus
      />
      <div className="flex gap-2">
        <select
          value={newEvent}
          onChange={e => setNewEvent(e.target.value as HookEvent)}
          className="bg-input text-foreground text-xs px-2 py-1.5 rounded-sm border border-border outline-none"
        >
          {addTab === 'agent' && <>
            <option value="PreToolUse">PreToolUse</option>
            <option value="PostToolUse">PostToolUse</option>
          </>}
          {addTab === 'webhook' && <option value="Webhook">Webhook</option>}
          {addTab === 'event' && <>
            <option value="OnDeploy">OnDeploy</option>
            <option value="OnFileChange">OnFileChange</option>
            <option value="OnError">OnError</option>
          </>}
        </select>
        <select
          value={newAction}
          onChange={e => setNewAction(e.target.value as HookAction)}
          className="bg-input text-foreground text-xs px-2 py-1.5 rounded-sm border border-border outline-none"
        >
          <option value="deny">deny</option>
          <option value="allow">allow</option>
          <option value="log">log</option>
          <option value="transform">transform</option>
          <option value="webhook">webhook</option>
          <option value="notify">notify</option>
        </select>
      </div>
      <div className="flex gap-2">
        <input
          value={newTool}
          onChange={e => setNewTool(e.target.value)}
          placeholder="Tool pattern..."
          className="flex-1 bg-input text-foreground text-xs px-2 py-1.5 rounded-sm border border-border outline-none"
        />
        <input
          value={newCmd}
          onChange={e => setNewCmd(e.target.value)}
          placeholder="Command regex..."
          className="flex-1 bg-input text-foreground text-xs px-2 py-1.5 rounded-sm border border-border outline-none"
        />
      </div>
      {(newAction === 'webhook') && (
        <input
          value={newWebhookUrl}
          onChange={e => setNewWebhookUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full bg-input text-foreground text-xs px-2 py-1.5 rounded-sm border border-border outline-none focus:border-primary"
        />
      )}
      <div className="flex gap-2">
        <button onClick={handleAdd} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors">
          Add Hook
        </button>
        <button onClick={() => setShowAdd(false)} className="px-3 py-1 text-xs bg-muted text-muted-foreground rounded-sm hover:bg-accent transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Anchor className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Hooks & Webhooks</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <Tabs defaultValue="agent" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-9 px-2">
            <TabsTrigger value="agent" className="text-xs data-[state=active]:bg-muted gap-1" onClick={() => { setAddTab('agent'); setShowAdd(false); }}>
              <Zap className="h-3 w-3" /> Agent
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs data-[state=active]:bg-muted gap-1" onClick={() => { setAddTab('webhook'); setShowAdd(false); }}>
              <Globe className="h-3 w-3" /> Webhooks
            </TabsTrigger>
            <TabsTrigger value="events" className="text-xs data-[state=active]:bg-muted gap-1" onClick={() => { setAddTab('event'); setShowAdd(false); }}>
              <Bell className="h-3 w-3" /> Events
            </TabsTrigger>
          </TabsList>

          {/* Agent Hooks Tab */}
          <TabsContent value="agent" className="mt-0">
            <div className="max-h-[280px] overflow-auto p-2 space-y-1">
              {agentHooks.map(renderHookRow)}
              {agentHooks.length === 0 && !showAdd && (
                <p className="text-sm text-muted-foreground text-center py-4">No agent hooks configured</p>
              )}
            </div>
            {showAdd && addTab === 'agent' && renderAddForm()}
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="mt-0">
            <div className="max-h-[360px] overflow-auto">
              {/* Webhook Secrets */}
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Endpoint Secrets</p>
                {webhookSecrets.map(secret => (
                  <div key={secret.id} className="flex items-center gap-2 mb-1.5 px-2 py-1.5 bg-muted/50 rounded-sm">
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{secret.label}</span>
                    <button onClick={() => copyToClipboard(secret.token)} className="p-1 hover:bg-muted rounded-sm" title="Copy token">
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {webhookBaseUrl && projectId && (
                      <button onClick={() => copyToClipboard(`${webhookBaseUrl}?project_id=${projectId}&token=${secret.token}`)} className="p-1 hover:bg-muted rounded-sm" title="Copy full URL">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                    <button onClick={() => testWebhook(secret)} disabled={testingWebhook} className="p-1 hover:bg-muted rounded-sm" title="Test webhook">
                      <Send className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button onClick={() => onDeleteSecret?.(secret.id)} className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-ide-error">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {webhookSecrets.length === 0 && (
                  <p className="text-[10px] text-muted-foreground mb-1">No secrets generated yet.</p>
                )}
                <div className="flex items-center gap-1 mt-1">
                  <input
                    value={secretLabel}
                    onChange={e => setSecretLabel(e.target.value)}
                    placeholder="Secret label..."
                    className="flex-1 bg-input text-foreground text-[10px] px-2 py-1 rounded-sm border border-border outline-none"
                  />
                  <button
                    onClick={async () => {
                      if (onGenerateSecret) {
                        await onGenerateSecret(secretLabel || 'default');
                        setSecretLabel('');
                      }
                    }}
                    className="px-2 py-1 text-[10px] bg-primary/10 text-primary rounded-sm hover:bg-primary/20 transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>

              {/* Webhook Hooks */}
              <div className="p-2 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-1 mb-1">Webhook Hooks</p>
                {webhookHooks.map(renderHookRow)}
                {webhookHooks.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">No webhook hooks. Add one to process inbound webhooks.</p>
                )}
              </div>

              {/* Execution Log */}
              <div className="px-3 py-2 border-t border-border">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Recent Executions</p>
                  <button onClick={onRefreshExecutions} className="p-0.5 hover:bg-muted rounded-sm">
                    <RefreshCw className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                <div className="max-h-[120px] overflow-auto space-y-1">
                  {executions.slice(0, 10).map(exec => (
                    <div key={exec.id} className="flex items-center gap-2 text-[10px] px-1.5 py-1 bg-muted/30 rounded-sm">
                      <span className={`w-1.5 h-1.5 rounded-full ${exec.status === 'success' ? 'bg-ide-success' : 'bg-ide-error'}`} />
                      <span className="text-muted-foreground">{exec.event}</span>
                      <span className="text-foreground flex-1 truncate">{exec.durationMs}ms</span>
                      <span className="text-muted-foreground">{exec.createdAt.toLocaleTimeString()}</span>
                    </div>
                  ))}
                  {executions.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No executions yet</p>
                  )}
                </div>
              </div>
            </div>
            {showAdd && addTab === 'webhook' && renderAddForm()}
          </TabsContent>

          {/* Event Hooks Tab */}
          <TabsContent value="events" className="mt-0">
            <div className="max-h-[280px] overflow-auto p-2 space-y-1">
              {eventHooks.map(renderHookRow)}
              {eventHooks.length === 0 && !showAdd && (
                <p className="text-sm text-muted-foreground text-center py-4">No event hooks configured</p>
              )}
            </div>
            {showAdd && addTab === 'event' && renderAddForm()}
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            Hooks run before/after tool calls, on webhooks, and on events.
          </p>
          {!showAdd && (
            <button
              onClick={() => {
                setShowAdd(true);
                // Set sensible defaults based on active tab
                if (addTab === 'agent') setNewEvent('PreToolUse');
                else if (addTab === 'webhook') { setNewEvent('Webhook'); setNewAction('log'); }
                else { setNewEvent('OnDeploy'); setNewAction('webhook'); }
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary/10 text-primary rounded-sm hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

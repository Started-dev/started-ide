import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Hook, DEFAULT_HOOKS, WebhookSecret, HookExecution, HookEvent, HookAction } from '@/types/agent';

export function useProjectHooks(projectId: string | null) {
  const [hooks, setHooks] = useState<Hook[]>(DEFAULT_HOOKS);
  const [webhookSecrets, setWebhookSecrets] = useState<WebhookSecret[]>([]);
  const [executions, setExecutions] = useState<HookExecution[]>([]);
  const [loading, setLoading] = useState(false);

  // Load hooks from DB
  useEffect(() => {
    if (!projectId) {
      setHooks(DEFAULT_HOOKS);
      return;
    }

    const loadHooks = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('project_hooks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        setHooks(data.map(row => ({
          id: row.id,
          event: row.event as HookEvent,
          toolPattern: row.tool_pattern,
          commandPattern: row.command_pattern || undefined,
          action: row.action as HookAction,
          label: row.label,
          enabled: row.enabled,
          webhookUrl: row.webhook_url || undefined,
          projectId: row.project_id,
        })));
      } else {
        // Seed defaults
        const inserts = DEFAULT_HOOKS.map(h => ({
          project_id: projectId,
          event: h.event,
          tool_pattern: h.toolPattern,
          command_pattern: h.commandPattern || null,
          action: h.action,
          label: h.label,
          enabled: h.enabled,
        }));
        const { data: seeded } = await supabase
          .from('project_hooks')
          .insert(inserts)
          .select();
        if (seeded) {
          setHooks(seeded.map(row => ({
            id: row.id,
            event: row.event as HookEvent,
            toolPattern: row.tool_pattern,
            commandPattern: row.command_pattern || undefined,
            action: row.action as HookAction,
            label: row.label,
            enabled: row.enabled,
            webhookUrl: row.webhook_url || undefined,
            projectId: row.project_id,
          })));
        } else {
          setHooks(DEFAULT_HOOKS);
        }
      }
      setLoading(false);
    };

    loadHooks();
  }, [projectId]);

  // Load webhook secrets
  const loadSecrets = useCallback(async () => {
    if (!projectId) return;
    // Read from the masked view — tokens show as "••••••••<last8>"
    const { data } = await supabase
      .from('project_webhook_secrets_safe' as any)
      .select('*')
      .eq('project_id', projectId);
    if (data) {
      setWebhookSecrets((data as any[]).map(r => ({
        id: r.id,
        projectId: r.project_id,
        token: r.token_masked, // masked token for display
        label: r.label,
        createdAt: new Date(r.created_at),
      })));
    }
  }, [projectId]);

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  // Load recent executions
  const loadExecutions = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('hook_execution_log')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setExecutions(data.map(r => ({
        id: r.id,
        hookId: r.hook_id,
        projectId: r.project_id,
        event: r.event,
        inputPayload: (r.input_payload as Record<string, unknown>) || {},
        outputPayload: (r.output_payload as Record<string, unknown>) || {},
        status: r.status as 'success' | 'failed',
        durationMs: r.duration_ms || 0,
        createdAt: new Date(r.created_at),
      })));
    }
  }, [projectId]);

  useEffect(() => { loadExecutions(); }, [loadExecutions]);

  const toggleHook = useCallback(async (id: string) => {
    const hook = hooks.find(h => h.id === id);
    if (!hook) return;
    const newEnabled = !hook.enabled;
    setHooks(prev => prev.map(h => h.id === id ? { ...h, enabled: newEnabled } : h));
    if (hook.projectId) {
      await supabase.from('project_hooks').update({ enabled: newEnabled }).eq('id', id);
    }
  }, [hooks]);

  const addHook = useCallback(async (hook: Omit<Hook, 'id'>) => {
    if (!projectId) {
      setHooks(prev => [...prev, { ...hook, id: `hook-${Date.now()}` }]);
      return;
    }
    const { data } = await supabase
      .from('project_hooks')
      .insert({
        project_id: projectId,
        event: hook.event,
        tool_pattern: hook.toolPattern,
        command_pattern: hook.commandPattern || null,
        action: hook.action,
        webhook_url: hook.webhookUrl || null,
        label: hook.label,
        enabled: hook.enabled,
      })
      .select()
      .single();
    if (data) {
      setHooks(prev => [...prev, {
        id: data.id,
        event: data.event as HookEvent,
        toolPattern: data.tool_pattern,
        commandPattern: data.command_pattern || undefined,
        action: data.action as HookAction,
        label: data.label,
        enabled: data.enabled,
        webhookUrl: data.webhook_url || undefined,
        projectId: data.project_id,
      }]);
    }
  }, [projectId]);

  const removeHook = useCallback(async (id: string) => {
    setHooks(prev => prev.filter(h => h.id !== id));
    await supabase.from('project_hooks').delete().eq('id', id);
  }, []);

  const generateSecret = useCallback(async (label: string = 'default') => {
    if (!projectId) return null;
    const { data } = await supabase
      .from('project_webhook_secrets')
      .insert({ project_id: projectId, label })
      .select()
      .single();
    if (data) {
      const secret: WebhookSecret = {
        id: data.id,
        projectId: data.project_id,
        token: data.token,
        label: data.label,
        createdAt: new Date(data.created_at),
      };
      setWebhookSecrets(prev => [...prev, secret]);
      return secret;
    }
    return null;
  }, [projectId]);

  const deleteSecret = useCallback(async (id: string) => {
    setWebhookSecrets(prev => prev.filter(s => s.id !== id));
    await supabase.from('project_webhook_secrets').delete().eq('id', id);
  }, []);

  return {
    hooks,
    webhookSecrets,
    executions,
    loading,
    toggleHook,
    addHook,
    removeHook,
    generateSecret,
    deleteSecret,
    loadExecutions,
  };
}

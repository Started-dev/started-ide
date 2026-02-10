import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, ShieldX, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIDE } from '@/contexts/IDEContext';

interface PermissionRule {
  id: string;
  rule_type: string;
  subject: string;
  effect: string;
  reason: string | null;
  created_at: string;
}

interface PermissionRulesManagerProps {
  onClose: () => void;
}

const EFFECT_OPTIONS = [
  { value: 'allow', label: 'Allow', icon: ShieldCheck, color: 'text-ide-success' },
  { value: 'ask', label: 'Ask', icon: ShieldAlert, color: 'text-ide-warning' },
  { value: 'deny', label: 'Deny', icon: ShieldX, color: 'text-ide-error' },
];

const RULE_TYPE_OPTIONS = [
  { value: 'command_prefix', label: 'Command Prefix' },
  { value: 'regex', label: 'Regex Pattern' },
  { value: 'risk', label: 'Risk Level' },
];

export function PermissionRulesManager({ onClose }: PermissionRulesManagerProps) {
  const { project } = useIDE();
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [newRuleType, setNewRuleType] = useState('command_prefix');
  const [newSubject, setNewSubject] = useState('');
  const [newEffect, setNewEffect] = useState('ask');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('project_permissions')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    setRules(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRules(); }, [project.id]);

  const addRule = async () => {
    if (!newSubject.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('project_permissions').insert({
      project_id: project.id,
      rule_type: newRuleType,
      subject: newSubject.trim(),
      effect: newEffect,
      reason: newReason.trim() || null,
      created_by: (await supabase.auth.getUser()).data.user?.id || null,
    });
    if (!error) {
      setNewSubject('');
      setNewReason('');
      await fetchRules();
    }
    setAdding(false);
  };

  const removeRule = async (id: string) => {
    await supabase.from('project_permissions').delete().eq('id', id);
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const effectConfig = (effect: string) =>
    EFFECT_OPTIONS.find(e => e.value === effect) || EFFECT_OPTIONS[1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Permission Rules</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-sm hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add new rule */}
        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add Rule</div>
          <div className="flex gap-2">
            <select
              value={newRuleType}
              onChange={e => setNewRuleType(e.target.value)}
              className="text-xs bg-muted border border-border rounded-sm px-2 py-1.5 text-foreground"
            >
              {RULE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={newEffect}
              onChange={e => setNewEffect(e.target.value)}
              className="text-xs bg-muted border border-border rounded-sm px-2 py-1.5 text-foreground"
            >
              {EFFECT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <input
            value={newSubject}
            onChange={e => setNewSubject(e.target.value)}
            placeholder={newRuleType === 'command_prefix' ? 'e.g. npm test' : newRuleType === 'regex' ? 'e.g. rm\\s+-rf' : 'e.g. write'}
            className="w-full text-xs bg-muted border border-border rounded-sm px-2 py-1.5 text-foreground placeholder:text-muted-foreground font-mono"
            onKeyDown={e => e.key === 'Enter' && addRule()}
          />
          <div className="flex gap-2">
            <input
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 text-xs bg-muted border border-border rounded-sm px-2 py-1.5 text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={addRule}
              disabled={!newSubject.trim() || adding}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-primary/15 text-primary rounded-sm hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Loading…</div>
          ) : rules.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No permission rules configured. Commands will use default behavior.
            </div>
          ) : (
            <div className="space-y-1">
              {rules.map(rule => {
                const ec = effectConfig(rule.effect);
                const Icon = ec.icon;
                return (
                  <div key={rule.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted/50 group">
                    <Icon className={`h-3.5 w-3.5 ${ec.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1 py-0.5 rounded-sm bg-muted font-medium ${ec.color}`}>
                          {ec.label}
                        </span>
                        <span className="text-[10px] px-1 py-0.5 rounded-sm bg-muted text-muted-foreground">
                          {RULE_TYPE_OPTIONS.find(r => r.value === rule.rule_type)?.label || rule.rule_type}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-foreground mt-0.5 truncate">{rule.subject}</div>
                      {rule.reason && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{rule.reason}</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="p-1 rounded-sm text-muted-foreground hover:text-ide-error hover:bg-ide-error/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove rule"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          Rules are evaluated top-down. First match wins. Unmatched commands use default "ask" behavior.
        </div>
      </div>
    </div>
  );
}

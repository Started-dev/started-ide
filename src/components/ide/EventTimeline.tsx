import { useState, useEffect, useCallback } from 'react';
import {
  Activity, FileCode, Play, Plug, Brain, Clock, Filter,
  RefreshCw, Zap, GitMerge, CheckCircle, XCircle, Eye,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIDE } from '@/contexts/IDEContext';

interface ProjectEvent {
  id: string;
  project_id: string;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  'patch.applied': <FileCode className="h-3 w-3" />,
  'snapshot.created': <GitMerge className="h-3 w-3" />,
  'run.started': <Play className="h-3 w-3" />,
  'run.done': <CheckCircle className="h-3 w-3" />,
  'run.log': <Activity className="h-3 w-3" />,
  'mcp.call': <Plug className="h-3 w-3" />,
  'agent.step': <Brain className="h-3 w-3" />,
  'ref.merged': <GitMerge className="h-3 w-3" />,
};

const EVENT_COLORS: Record<string, string> = {
  'patch.applied': 'text-blue-400 bg-blue-500/10',
  'snapshot.created': 'text-purple-400 bg-purple-500/10',
  'run.started': 'text-amber-400 bg-amber-500/10',
  'run.done': 'text-emerald-400 bg-emerald-500/10',
  'mcp.call': 'text-cyan-400 bg-cyan-500/10',
  'agent.step': 'text-pink-400 bg-pink-500/10',
  'ref.merged': 'text-indigo-400 bg-indigo-500/10',
};

const FILTER_OPTIONS = ['all', 'patch', 'run', 'mcp', 'agent', 'snapshot'] as const;

export function EventTimeline() {
  const { project } = useIDE();
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [filter, setFilter] = useState<typeof FILTER_OPTIONS[number]>('all');
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!project.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('project_events')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(100);

    setEvents((data as unknown as ProjectEvent[]) || []);
    setLoading(false);
  }, [project.id]);

  // Initial load
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Real-time subscription
  useEffect(() => {
    if (!project.id) return;

    const channel = supabase
      .channel(`events-${project.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_events',
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          const newEvent = payload.new as unknown as ProjectEvent;
          setEvents((prev) => [newEvent, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  const filtered = events.filter((e) => {
    if (filter === 'all') return true;
    return e.event_type.startsWith(filter);
  });

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getEventLabel = (e: ProjectEvent): string => {
    switch (e.event_type) {
      case 'patch.applied':
        return `Patch: ${((e.payload.changed_paths as string[]) || []).length} files`;
      case 'snapshot.created':
        return `Snapshot: ${e.payload.label || 'auto'}`;
      case 'run.started':
        return `Run: ${(e.payload.command as string) || ''}`;
      case 'run.done': {
        const code = e.payload.exit_code as number;
        return `Run ${code === 0 ? 'succeeded' : `failed (${code})`}`;
      }
      case 'mcp.call':
        return `MCP: ${e.payload.tool_name || ''}`;
      case 'agent.step':
        return `Agent: ${e.payload.title || ''}`;
      case 'ref.merged':
        return `Merged: ${e.payload.source_ref} → ${e.payload.target_ref}`;
      default:
        return e.event_type;
    }
  };

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider">Timeline</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
            {filtered.length}
          </span>
        </div>
        <button
          onClick={loadEvents}
          className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent/30 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border overflow-x-auto">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 text-[10px] rounded-sm transition-colors ${
              filter === f
                ? 'bg-primary/15 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Events */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-xs">No events yet</p>
          </div>
        )}

        <div className="relative">
          {filtered.length > 0 && (
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          )}

          <div className="space-y-0.5">
            {filtered.map((event) => {
              const icon = EVENT_ICONS[event.event_type] || <Zap className="h-3 w-3" />;
              const colors = EVENT_COLORS[event.event_type] || 'text-muted-foreground bg-muted';

              return (
                <div key={event.id} className="relative flex items-start gap-2 py-1">
                  <div className={`relative z-10 flex items-center justify-center w-4 h-4 rounded-full shrink-0 ${colors}`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">
                        {getEventLabel(event)}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(event.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="capitalize">{event.actor_type}</span>
                      {event.payload.attestation_hash && (
                        <span className="flex items-center gap-0.5 text-emerald-400">
                          <Eye className="h-2 w-2" />
                          Attested
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

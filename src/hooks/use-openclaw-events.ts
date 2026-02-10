import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OpenClawEvent {
  id: string;
  project_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

type EventHandler = (event: OpenClawEvent) => void;

const EVENT_LABELS: Record<string, string> = {
  'task.completed': '✅ Task completed',
  'task.failed': '❌ Task failed',
  'task.started': '🚀 Task started',
  'task.progress': '⏳ Task progress',
  'message.received': '💬 Message received',
  'skill.installed': '🔧 Skill installed',
  'skill.uninstalled': '🗑️ Skill uninstalled',
  'memory.added': '🧠 Memory added',
  'error': '⚠️ Error',
};

export function useOpenClawEvents(
  projectId: string | undefined,
  onEvent?: EventHandler
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const showToast = useCallback((event: OpenClawEvent) => {
    const label = EVENT_LABELS[event.event_type] || event.event_type;
    const detail =
      (event.payload as any)?.message ||
      (event.payload as any)?.goal ||
      (event.payload as any)?.name ||
      '';
    toast.info(`${label}${detail ? `: ${detail}` : ''}`);
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`openclaw-events-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'openclaw_events',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const event = payload.new as OpenClawEvent;
          showToast(event);
          handlerRef.current?.(event);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, showToast]);
}

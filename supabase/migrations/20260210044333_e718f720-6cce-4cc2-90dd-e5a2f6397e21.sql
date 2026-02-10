
-- Table to store OpenClaw webhook events for realtime broadcasting
CREATE TABLE public.openclaw_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- e.g. 'task.completed', 'task.failed', 'message.received', 'skill.installed'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.openclaw_events ENABLE ROW LEVEL SECURITY;

-- Users can read events for their projects
CREATE POLICY "Users can read own project events"
  ON public.openclaw_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM project_collaborators
      WHERE project_id = openclaw_events.project_id AND user_id = auth.uid() AND accepted = true
    )
  );

-- Service role inserts (edge function uses service role)
CREATE POLICY "Service role can insert events"
  ON public.openclaw_events FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.openclaw_events;

-- Auto-cleanup old events (keep last 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_openclaw_events()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.openclaw_events WHERE created_at < now() - interval '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_openclaw_events
  AFTER INSERT ON public.openclaw_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.cleanup_old_openclaw_events();

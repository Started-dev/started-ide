
-- Fix overly permissive INSERT policy on openclaw_events
DROP POLICY IF EXISTS "Service role can insert events" ON public.openclaw_events;

CREATE POLICY "Authenticated users can insert events for own projects"
  ON public.openclaw_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.project_collaborators pc
      WHERE pc.project_id = openclaw_events.project_id
        AND pc.user_id = auth.uid()
        AND pc.accepted = true
    )
  );

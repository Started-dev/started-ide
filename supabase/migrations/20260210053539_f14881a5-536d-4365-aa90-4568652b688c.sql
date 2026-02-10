
-- ═══════════════════════════════════════════════════════════════
-- Agent Runs: persistent orchestrator state
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  preset_key text,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','paused','failed','done','cancelled')),
  current_step int NOT NULL DEFAULT 0,
  max_steps int NOT NULL DEFAULT 25,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent runs"
  ON public.agent_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent runs"
  ON public.agent_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent runs"
  ON public.agent_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_agent_runs_project ON public.agent_runs(project_id);
CREATE INDEX idx_agent_runs_status ON public.agent_runs(status);

-- ═══════════════════════════════════════════════════════════════
-- Agent Steps: each action in an agent run
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_index int NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'plan'
    CHECK (kind IN ('plan','read','grep','patch','apply','run','mcp','decision','checkpoint','think','done','error')),
  title text NOT NULL DEFAULT '',
  input jsonb DEFAULT '{}',
  output jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','error','blocked','running')),
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view steps of own runs"
  ON public.agent_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agent_runs ar WHERE ar.id = agent_run_id AND ar.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert steps for own runs"
  ON public.agent_steps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_runs ar WHERE ar.id = agent_run_id AND ar.user_id = auth.uid()
  ));

CREATE INDEX idx_agent_steps_run ON public.agent_steps(agent_run_id);
CREATE INDEX idx_agent_steps_run_index ON public.agent_steps(agent_run_id, step_index);

-- ═══════════════════════════════════════════════════════════════
-- Project Permissions: unified allow/ask/deny rules
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.project_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rule_type text NOT NULL DEFAULT 'command_prefix'
    CHECK (rule_type IN ('command_prefix','regex','risk','file_pattern','tool_name')),
  subject text NOT NULL,
  effect text NOT NULL DEFAULT 'ask'
    CHECK (effect IN ('allow','ask','deny')),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view permissions"
  ON public.project_permissions FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "Project owners can manage permissions"
  ON public.project_permissions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid()
  ));

CREATE INDEX idx_project_permissions_project ON public.project_permissions(project_id);

-- ═══════════════════════════════════════════════════════════════
-- Trigger for agent_runs updated_at
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_agent_runs_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- Enable realtime for agent_runs and agent_steps (for live timeline)
-- ═══════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_steps;

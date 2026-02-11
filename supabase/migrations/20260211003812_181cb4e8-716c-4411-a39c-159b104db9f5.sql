
-- =====================================================================
-- A) STORAGE ZONE: Content-Addressed Snapshots (Merkle DAG)
-- =====================================================================

-- Blobs: file contents keyed by sha256 hash
CREATE TABLE public.ca_blobs (
  hash text PRIMARY KEY,
  byte_size integer NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_blobs ENABLE ROW LEVEL SECURITY;

-- Trees: directory nodes
CREATE TABLE public.ca_trees (
  hash text PRIMARY KEY,
  entries jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_trees ENABLE ROW LEVEL SECURITY;

-- Snapshots: root tree hash + metadata
CREATE TABLE public.ca_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  root_tree_hash text NOT NULL REFERENCES public.ca_trees(hash),
  parent_snapshot_id uuid REFERENCES public.ca_snapshots(id),
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ca_snapshots_project ON public.ca_snapshots(project_id, created_at DESC);

-- Refs: named pointers (main, agent/<run_id>, branch/<name>)
CREATE TABLE public.ca_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ref_name text NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES public.ca_snapshots(id),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, ref_name)
);
ALTER TABLE public.ca_refs ENABLE ROW LEVEL SECURITY;

-- Path index for fast file lookups
CREATE TABLE public.ca_path_index (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.ca_snapshots(id) ON DELETE CASCADE,
  path text NOT NULL,
  blob_hash text NOT NULL REFERENCES public.ca_blobs(hash),
  PRIMARY KEY(project_id, snapshot_id, path)
);
ALTER TABLE public.ca_path_index ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- B) PROOF ZONE: Build Attestations
-- =====================================================================

CREATE TABLE public.build_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  runner_node_id uuid,
  input_snapshot_id uuid REFERENCES public.ca_snapshots(id),
  output_snapshot_id uuid REFERENCES public.ca_snapshots(id),
  command text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  exit_code integer,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  stdout_trunc text,
  stderr_trunc text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.build_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_build_runs_project ON public.build_runs(project_id, created_at DESC);

CREATE TABLE public.build_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_run_id uuid NOT NULL REFERENCES public.build_runs(id) ON DELETE CASCADE,
  attestation_hash text NOT NULL,
  snapshot_hash text NOT NULL,
  command_hash text NOT NULL,
  runner_fingerprint jsonb NOT NULL DEFAULT '{}',
  logs_hashes jsonb NOT NULL DEFAULT '{}',
  artifacts_hashes jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(build_run_id)
);
ALTER TABLE public.build_attestations ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- C) COMPUTE ZONE: Runner Mesh + Node Registry
-- =====================================================================

CREATE TABLE public.runner_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  region text,
  trust_tier text NOT NULL DEFAULT 'tier0',
  capabilities jsonb NOT NULL DEFAULT '{"runtimes":[],"toolchains":[],"web3":[],"gpu":false,"maxConcurrency":4}',
  pricing jsonb NOT NULL DEFAULT '{"perMinute":0,"perGBMinute":0}',
  status text NOT NULL DEFAULT 'active',
  last_heartbeat timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.runner_nodes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.runner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  runner_node_id uuid NOT NULL REFERENCES public.runner_nodes(id),
  remote_session_id text NOT NULL,
  cwd text DEFAULT '/workspace',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, runner_node_id)
);
ALTER TABLE public.runner_sessions ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- D) NETWORKING ZONE: Event Bus + Timeline
-- =====================================================================

CREATE TABLE public.project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_type text NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_project_events_timeline ON public.project_events(project_id, created_at);

-- Enable realtime for project_events
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_events;

-- =====================================================================
-- RLS Policies (using is_project_member for all project-scoped tables)
-- =====================================================================

-- ca_blobs: readable by all authenticated (content-addressed = shared), writable by authenticated
CREATE POLICY "Authenticated can read blobs" ON public.ca_blobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert blobs" ON public.ca_blobs FOR INSERT TO authenticated WITH CHECK (true);

-- ca_trees: same as blobs
CREATE POLICY "Authenticated can read trees" ON public.ca_trees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert trees" ON public.ca_trees FOR INSERT TO authenticated WITH CHECK (true);

-- ca_snapshots: project-scoped
CREATE POLICY "Members can read snapshots" ON public.ca_snapshots FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can create snapshots" ON public.ca_snapshots FOR INSERT TO authenticated
  WITH CHECK (is_project_member(auth.uid(), project_id));

-- ca_refs: project-scoped
CREATE POLICY "Members can read refs" ON public.ca_refs FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can manage refs" ON public.ca_refs FOR ALL TO authenticated
  USING (is_project_member(auth.uid(), project_id))
  WITH CHECK (is_project_member(auth.uid(), project_id));

-- ca_path_index: project-scoped
CREATE POLICY "Members can read path index" ON public.ca_path_index FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can insert path index" ON public.ca_path_index FOR INSERT TO authenticated
  WITH CHECK (is_project_member(auth.uid(), project_id));

-- build_runs: project-scoped
CREATE POLICY "Members can read build runs" ON public.build_runs FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can create build runs" ON public.build_runs FOR INSERT TO authenticated
  WITH CHECK (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can update build runs" ON public.build_runs FOR UPDATE TO authenticated
  USING (is_project_member(auth.uid(), project_id));

-- build_attestations: readable via build_run join
CREATE POLICY "Members can read attestations" ON public.build_attestations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.build_runs br WHERE br.id = build_attestations.build_run_id AND is_project_member(auth.uid(), br.project_id)));
CREATE POLICY "Members can create attestations" ON public.build_attestations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.build_runs br WHERE br.id = build_attestations.build_run_id AND is_project_member(auth.uid(), br.project_id)));

-- runner_nodes: readable by all authenticated, writable only by service role (no user insert policy)
CREATE POLICY "Authenticated can read runner nodes" ON public.runner_nodes FOR SELECT TO authenticated USING (true);

-- runner_sessions: project-scoped
CREATE POLICY "Members can read runner sessions" ON public.runner_sessions FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can manage runner sessions" ON public.runner_sessions FOR ALL TO authenticated
  USING (is_project_member(auth.uid(), project_id))
  WITH CHECK (is_project_member(auth.uid(), project_id));

-- project_events: project-scoped
CREATE POLICY "Members can read project events" ON public.project_events FOR SELECT TO authenticated
  USING (is_project_member(auth.uid(), project_id));
CREATE POLICY "Members can create project events" ON public.project_events FOR INSERT TO authenticated
  WITH CHECK (is_project_member(auth.uid(), project_id));

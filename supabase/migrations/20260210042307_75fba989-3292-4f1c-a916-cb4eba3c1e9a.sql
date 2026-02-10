
-- =============================================
-- MCP Registry + Permissions + Billing Schema
-- =============================================

-- A) mcp_servers: registry of available MCP servers
CREATE TABLE public.mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  homepage_url text,
  default_risk text NOT NULL DEFAULT 'read',
  requires_secrets boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read mcp_servers" ON public.mcp_servers FOR SELECT USING (true);

-- B) project_mcp_servers: per-project server config
CREATE TABLE public.project_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, server_id)
);
ALTER TABLE public.project_mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project owner can manage project_mcp_servers" ON public.project_mcp_servers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_mcp_servers.project_id AND owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_mcp_servers.project_id AND owner_id = auth.uid())
  );

-- C) mcp_tools: tool definitions per server
CREATE TABLE public.mcp_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  display_name text,
  description text,
  input_schema jsonb NOT NULL DEFAULT '{}',
  output_schema jsonb NOT NULL DEFAULT '{}',
  risk text NOT NULL DEFAULT 'read',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_id, tool_name)
);
ALTER TABLE public.mcp_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read mcp_tools" ON public.mcp_tools FOR SELECT USING (true);

-- D) mcp_permissions: per-project permission rules
CREATE TABLE public.mcp_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  subject text NOT NULL,
  effect text NOT NULL,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mcp_permissions_project_rule ON public.mcp_permissions(project_id, rule_type);
ALTER TABLE public.mcp_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project owner can manage mcp_permissions" ON public.mcp_permissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = mcp_permissions.project_id AND owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = mcp_permissions.project_id AND owner_id = auth.uid())
  );

-- E) mcp_audit_log: immutable audit trail
CREATE TABLE public.mcp_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  agent_run_id uuid,
  server_key text NOT NULL,
  tool_name text NOT NULL,
  risk text NOT NULL,
  input_hash text NOT NULL,
  output_hash text,
  status text NOT NULL,
  latency_ms int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project owner can read audit log" ON public.mcp_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = mcp_audit_log.project_id AND owner_id = auth.uid())
  );

-- F) api_usage_ledger: per-user billing counters
CREATE TABLE public.api_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  mcp_calls int NOT NULL DEFAULT 0,
  runner_minutes numeric NOT NULL DEFAULT 0,
  model_tokens numeric NOT NULL DEFAULT 0,
  storage_mb numeric NOT NULL DEFAULT 0,
  plan_key text NOT NULL DEFAULT 'free',
  UNIQUE(owner_id, period_start, period_end)
);
ALTER TABLE public.api_usage_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own usage" ON public.api_usage_ledger
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Users can insert own usage" ON public.api_usage_ledger
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Users can update own usage" ON public.api_usage_ledger
  FOR UPDATE USING (owner_id = auth.uid());

-- G) agent_presets: reusable agent configurations
CREATE TABLE public.agent_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  default_tools jsonb NOT NULL DEFAULT '[]',
  default_permissions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read agent_presets" ON public.agent_presets FOR SELECT USING (true);

-- H) billing_plans: pricing tier definitions
CREATE TABLE public.billing_plans (
  key text PRIMARY KEY,
  monthly_price_usd numeric NOT NULL DEFAULT 0,
  included_mcp_calls int NOT NULL DEFAULT 250,
  included_runner_minutes int NOT NULL DEFAULT 60,
  included_tokens int NOT NULL DEFAULT 250000,
  max_projects int NOT NULL DEFAULT 2,
  max_concurrent_runs int NOT NULL DEFAULT 1,
  features jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read billing_plans" ON public.billing_plans FOR SELECT USING (true);

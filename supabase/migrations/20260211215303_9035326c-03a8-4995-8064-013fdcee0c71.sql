
-- 1. Create mcp_tokens table for persistent token storage
CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  server_id text NOT NULL,
  token_key text NOT NULL,
  token_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id, server_id, token_key)
);

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tokens"
  ON public.mcp_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Add memory_notes column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS memory_notes jsonb DEFAULT '[]'::jsonb;

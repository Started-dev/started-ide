
-- Collaborators table: who has access to which project
CREATE TABLE public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
  invited_by uuid NOT NULL,
  accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is owner or accepted collaborator
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = _project_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM project_collaborators 
    WHERE project_id = _project_id AND user_id = _user_id AND accepted = true
  )
$$;

-- Collaborators RLS
CREATE POLICY "Project members can view collaborators"
  ON public.project_collaborators FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id) OR user_id = auth.uid());

CREATE POLICY "Project owners can insert collaborators"
  ON public.project_collaborators FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()));

CREATE POLICY "Project owners can delete collaborators"
  ON public.project_collaborators FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()));

CREATE POLICY "Collaborators can accept their own invite"
  ON public.project_collaborators FOR UPDATE
  USING (user_id = auth.uid());

-- File locks table
CREATE TABLE public.file_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  locked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_by_email text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, file_path)
);

ALTER TABLE public.file_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view file locks"
  ON public.file_locks FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "Members can create file locks"
  ON public.file_locks FOR INSERT
  WITH CHECK (public.is_project_member(auth.uid(), project_id) AND locked_by = auth.uid());

CREATE POLICY "Lock owner can release"
  ON public.file_locks FOR DELETE
  USING (locked_by = auth.uid());

-- Collaborative chat messages
CREATE TABLE public.collab_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collab_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view collab messages"
  ON public.collab_messages FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "Members can send collab messages"
  ON public.collab_messages FOR INSERT
  WITH CHECK (public.is_project_member(auth.uid(), project_id) AND user_id = auth.uid());

-- Enable realtime for collaboration tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_locks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_collaborators;

-- Update existing project_files and file_snapshots RLS to allow collaborators
DROP POLICY IF EXISTS "Users can view their project files" ON public.project_files;
CREATE POLICY "Members can view project files"
  ON public.project_files FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Users can insert their project files" ON public.project_files;
CREATE POLICY "Members can insert project files"
  ON public.project_files FOR INSERT
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Users can update their project files" ON public.project_files;
CREATE POLICY "Members can update project files"
  ON public.project_files FOR UPDATE
  USING (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Users can delete their project files" ON public.project_files;
CREATE POLICY "Members can delete project files"
  ON public.project_files FOR DELETE
  USING (public.is_project_member(auth.uid(), project_id));

-- Update runs RLS
DROP POLICY IF EXISTS "Users can view their runs" ON public.runs;
CREATE POLICY "Members can view runs"
  ON public.runs FOR SELECT
  USING (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Users can create runs" ON public.runs;
CREATE POLICY "Members can create runs"
  ON public.runs FOR INSERT
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS "Users can update their runs" ON public.runs;
CREATE POLICY "Members can update runs"
  ON public.runs FOR UPDATE
  USING (public.is_project_member(auth.uid(), project_id));

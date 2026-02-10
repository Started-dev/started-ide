
-- Create conversations table for chat history persistence
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New Chat',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Members can view conversations"
  ON public.conversations FOR SELECT
  USING (is_project_member(auth.uid(), project_id));

CREATE POLICY "Members can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (is_project_member(auth.uid(), project_id) AND user_id = auth.uid());

CREATE POLICY "Owner can update conversations"
  ON public.conversations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Owner can delete conversations"
  ON public.conversations FOR DELETE
  USING (user_id = auth.uid());

-- Index for fast lookup
CREATE INDEX idx_conversations_project_user ON public.conversations(project_id, user_id);

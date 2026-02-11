
-- 1. Drop the overly permissive read policy on ca_blobs
DROP POLICY "Authenticated can read blobs" ON public.ca_blobs;

-- 2. New policy: user can only read blobs linked to their projects
CREATE POLICY "Members can read project blobs"
  ON public.ca_blobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ca_path_index cpi
      WHERE cpi.blob_hash = ca_blobs.hash
        AND is_project_member(auth.uid(), cpi.project_id)
    )
  );

-- 3. Create a view that masks webhook tokens
CREATE VIEW public.project_webhook_secrets_safe
WITH (security_invoker = on) AS
  SELECT
    id,
    project_id,
    label,
    created_at,
    '••••••••' || RIGHT(token, 8) AS token_masked
  FROM public.project_webhook_secrets;

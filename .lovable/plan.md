

## Security Hardening: `ca_blobs` and `project_webhook_secrets`

### Problem 1: `ca_blobs` -- Any authenticated user can read all blobs

The current RLS policies (`Authenticated can read/insert blobs`) allow any logged-in user to read file content from any project by guessing SHA-256 blob hashes. While hashes are hard to guess, this violates the principle of least privilege.

**Fix**: Replace the permissive SELECT policy with one that requires the blob to be referenced by a project the user is a member of (via `ca_path_index`). The `snapshot-api` edge function already uses the service role key, so it bypasses RLS and continues working unchanged.

**Migration SQL**:
```sql
-- Drop the overly permissive read policy
DROP POLICY "Authenticated can read blobs" ON public.ca_blobs;

-- New policy: user can only read blobs linked to their projects
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
```

The INSERT policy ("Authenticated can insert blobs") is safe to keep -- content-addressable writes are idempotent and reveal no information.

---

### Problem 2: `project_webhook_secrets` -- Token exposure risk

The current `is_project_member` ALL policy is correctly scoped, but the client code (`use-project-hooks.ts`) does `select('*')` which fetches the raw `token` column. While project members are authorized to see their own tokens, best practice is to:

1. **Mask tokens in list queries** -- Only show full token once at creation time.
2. **Never log tokens** -- Ensure edge functions don't include tokens in error messages or execution logs.

**Approach**: Create a database view that masks tokens for normal reads. The client switches to reading from the view. The full token is only returned from the `insert().select()` call (at creation time).

**Migration SQL**:
```sql
-- View that masks tokens (shows last 8 chars only)
CREATE VIEW public.project_webhook_secrets_safe
WITH (security_invoker = on) AS
  SELECT
    id,
    project_id,
    label,
    created_at,
    '••••••••' || RIGHT(token, 8) AS token_masked
  FROM public.project_webhook_secrets;
```

**Code change in `src/hooks/use-project-hooks.ts`**:
- `loadSecrets()`: Query `project_webhook_secrets_safe` instead of `project_webhook_secrets` for listing. The `token` field becomes `token_masked`.
- `generateSecret()`: Keep the current `insert(...).select().single()` on the real table -- this returns the full token exactly once for the user to copy.
- Update the `WebhookSecret` type usage so the list shows masked tokens, and only the freshly-created secret shows the full token (via a transient state flag).

**Edge function check (`project-webhooks/index.ts`)**: Already safe -- it uses service role key and only does `.select("id")` when validating tokens (never returns the token in responses). No change needed.

---

### Summary of changes

| File | Change |
|------|--------|
| DB Migration | Drop permissive `ca_blobs` SELECT policy; add project-scoped policy |
| DB Migration | Create `project_webhook_secrets_safe` view |
| `src/hooks/use-project-hooks.ts` | Read from safe view for listing; keep insert on real table |

### Risks and considerations

- The `ca_blobs` policy adds a JOIN to `ca_path_index` on every blob read. Since direct blob reads only happen in the slow-path tree walk (the edge function uses service role), performance impact is negligible for client-side queries.
- Existing blobs that are not yet indexed in `ca_path_index` will become unreadable via RLS. This is acceptable because the `snapshot-api` (service role) handles all blob operations.
- The webhook token masking is a UX-safe change: users see the full token once at creation, then a masked version afterward -- standard practice for API keys.




# Add GitHub OAuth Secrets

## What's Needed

Two secrets must be added to the backend so the `github-oauth` edge function can authenticate with GitHub:

1. **GITHUB_CLIENT_ID** -- Your OAuth App's Client ID
2. **GITHUB_CLIENT_SECRET** -- Your OAuth App's Client Secret

## Steps

### 1. Add `GITHUB_CLIENT_ID` secret
- Store the Client ID as a backend secret named `GITHUB_CLIENT_ID`

### 2. Add `GITHUB_CLIENT_SECRET` secret
- Store the Client Secret as a backend secret named `GITHUB_CLIENT_SECRET`

### 3. Verify the fix
- After secrets are set, test the "Connect with GitHub" button in the IDE
- The `github-oauth` edge function should now return a valid `client_id` instead of an empty string
- The OAuth popup should redirect to GitHub's authorization page

## Important Notes
- Make sure your GitHub OAuth App's callback URL is set to: `https://started.lovable.app/auth/github/callback`
- No code changes are needed -- the `github-oauth` edge function already reads these environment variables


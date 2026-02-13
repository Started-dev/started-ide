# Migration from Lovable + Supabase to Started.dev

This document outlines the architectural changes made to remove Lovable and Supabase dependencies.

## What Changed

### Authentication
- **Before**: Supabase Auth with email/password
- **After**: Privy authentication with GitHub OAuth, email, and wallet support
- **Files Changed**:
  - `src/contexts/PrivyAuthContext.tsx` (new)
  - `src/components/PrivyProvider.tsx` (new)
  - `src/App.tsx` (updated to use Privy)

### Database
- **Before**: Supabase PostgreSQL with RLS policies
- **After**: Self-hosted PostgreSQL with application-level authorization
- **Files Changed**:
  - `api/_lib/db.ts` (new database client)
  - `api/db/[operation].ts` (query API endpoint)
  - `src/lib/db-client.ts` (client-side wrapper)
  - `src/integrations/supabase/client.ts` (now exports db-client)

### Edge Functions → Vercel Functions
- **Before**: 55 Supabase Edge Functions (Deno)
- **After**: Vercel Functions (Node.js)
- **Key Conversions**:
  - `supabase/functions/started/` → `api/started.ts`
  - `supabase/functions/agent-run/` → `api/agent-run.ts`
  - `supabase/functions/mcp-github/` → `api/mcp-github.ts`
  - And more...

### AI Gateway
- **Before**: `https://ai.gateway.lovable.dev`
- **After**: `https://started.dev/api/ai-gateway`
- **File**: `api/ai-gateway.ts`
- **Supports**: OpenAI, Anthropic, Google Gemini

### API Client
- **Before**: Direct Supabase client calls
- **After**: API client that calls Vercel Functions
- **File**: `src/lib/api-client.ts`

### Environment Variables
- **Before**:
  ```
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY  
  VITE_SUPABASE_PROJECT_ID
  ```
- **After**:
  ```
  VITE_PRIVY_APP_ID
  VITE_API_URL
  DATABASE_URL
  PRIVY_APP_ID
  PRIVY_APP_SECRET
  ANTHROPIC_API_KEY
  OPENAI_API_KEY
  GOOGLE_AI_API_KEY
  STARTED_API_KEY
  ```

## Deployment Steps

### 1. Set Up PostgreSQL Database

Option A: **Railway**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Create new project
railway init

# Add PostgreSQL
railway add postgresql

# Get connection string
railway variables
```

Option B: **Neon**
1. Go to https://neon.tech
2. Create new project
3. Copy connection string

Option B: **Self-hosted**
```bash
# Install PostgreSQL
docker run -d \
  --name started-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=started \
  -p 5432:5432 \
  postgres:15
```

### 2. Run Database Migrations

```bash
# Install PostgreSQL client
npm install -g pg

# Run migrations (in order)
for file in supabase/migrations/*.sql; do
  psql $DATABASE_URL -f $file
done
```

### 3. Set Up Privy

1. Go to https://privy.io
2. Create new app
3. Enable GitHub OAuth provider
4. Copy App ID and App Secret
5. Add to environment variables:
   ```
   VITE_PRIVY_APP_ID=your-app-id
   PRIVY_APP_ID=your-app-id
   PRIVY_APP_SECRET=your-app-secret
   ```

### 4. Configure AI API Keys

Add to Vercel environment variables:
```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
STARTED_API_KEY=your-custom-key
```

### 5. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Project Settings > Environment Variables

# Deploy to production
vercel --prod
```

### 6. Update DNS

Point `started.dev` to your Vercel deployment:
```
A record: @ → 76.76.21.21
CNAME record: www → cname.vercel-dns.com
```

## Testing

### Local Development

```bash
# Install dependencies
bun install

# Set environment variables
cp .env.example .env
# Edit .env with your values

# Start dev server
bun dev

# In another terminal, start Vercel dev server for API
vercel dev
```

### Test Authentication
1. Go to http://localhost:5173/auth
2. Click "Login with GitHub"
3. Authorize with GitHub
4. Should redirect to IDE

### Test Database
1. Open browser console
2. Check for any Supabase warnings
3. Create a new project
4. Files should save to PostgreSQL

### Test AI Gateway
1. Open IDE
2. Type a message in chat
3. Should stream response from AI

## Verification Checklist

- [ ] PostgreSQL database created and migrations applied
- [ ] Privy app configured with GitHub OAuth
- [ ] All API keys added to Vercel environment
- [ ] Vercel deployment successful
- [ ] DNS pointing to Vercel
- [ ] Authentication flow works
- [ ] Projects can be created and saved
- [ ] AI chat works
- [ ] Agent runs work
- [ ] MCP integrations work

## Known Limitations

1. **Realtime**: Supabase Realtime is used in 7 tables. A WebSocket server needs to be implemented for full realtime functionality.

2. **Storage**: Avatar uploads currently use Supabase Storage. Need to migrate to S3/R2.

3. **MCP Functions**: Only mcp-github is fully converted. Other 40+ MCP functions need conversion.

4. **Row Level Security**: PostgreSQL RLS policies removed. Authorization is now handled at application level in API routes.

## Rollback Plan

If issues occur:

1. Revert to previous commit:
   ```bash
   git reset --hard <commit-before-migration>
   git push --force
   ```

2. Re-deploy old version on Vercel

3. Old Supabase project remains intact (not deleted)

## Next Steps

1. **Implement WebSocket Server** for realtime features
2. **Migrate Storage** to S3/Cloudflare R2
3. **Convert Remaining MCP Functions** (40+ remaining)
4. **Add Monitoring** with Sentry or similar
5. **Set Up CI/CD** with GitHub Actions
6. **Add Rate Limiting** to API routes
7. **Implement Caching** for database queries

## Support

If you encounter issues:
- Check Vercel logs: `vercel logs`
- Check PostgreSQL logs
- Review browser console for errors
- Check this migration guide

## Files Reference

### New Files (Created)
- `api/_lib/db.ts` - Database helpers
- `api/_lib/auth.ts` - Privy auth middleware
- `api/_lib/cors.ts` - CORS helpers
- `api/ai-gateway.ts` - AI gateway endpoint
- `api/started.ts` - Started AI endpoint
- `api/agent-run.ts` - Agent run endpoint
- `api/profiles.ts` - Profile management
- `api/profiles/me.ts` - Current user profile
- `api/mcp-github.ts` - MCP GitHub integration
- `api/db/[operation].ts` - Database query API
- `src/lib/db-client.ts` - Database client wrapper
- `src/contexts/PrivyAuthContext.tsx` - Privy auth context
- `src/components/PrivyProvider.tsx` - Privy provider component
- `.env.example` - Environment variables template
- `vercel.json` - Vercel configuration

### Modified Files
- `README.md` - Removed Lovable references
- `package.json` - Added Privy, removed Supabase
- `.env` - New environment variables
- `src/App.tsx` - Uses Privy provider
- `src/lib/api-client.ts` - Updated to use new API
- `src/integrations/supabase/client.ts` - Now exports db-client

### Deprecated (No Longer Used)
- `src/contexts/AuthContext.tsx` - Replaced by PrivyAuthContext
- `supabase/functions/*` - Replaced by Vercel Functions

# Started IDE - Deployment Guide

Complete guide for deploying Started IDE to production on started.dev.

## Prerequisites

- Node.js 20.x (or Bun)
- PostgreSQL database (Railway, Neon, or self-hosted)
- Privy account
- Vercel account
- API keys for AI providers (Anthropic, OpenAI, Google)

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-org/Started-IDE.git
cd Started-IDE
bun install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your values

# 3. Deploy to Vercel
vercel deploy --prod
```

## Detailed Setup

### Step 1: Database Setup

#### Option A: Railway (Recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project
railway init

# Add PostgreSQL
railway add

# Select PostgreSQL from the list
# Railway will provision a database

# Get connection string
railway variables

# Copy the DATABASE_URL value
```

Add the `DATABASE_URL` to your `.env` file and Vercel environment variables.

#### Option B: Neon

1. Go to https://neon.tech
2. Create account and new project
3. Name it "started-ide"
4. Copy the connection string
5. Add to `.env` and Vercel

#### Apply Database Migrations

```bash
# Set DATABASE_URL in your shell
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# Apply migrations in order
cd supabase/migrations
for file in *.sql; do
  echo "Applying $file..."
  psql $DATABASE_URL -f $file
done
```

### Step 2: Privy Authentication Setup

1. Go to https://privy.io and create account
2. Create new app named "Started IDE"
3. Configure OAuth providers:
   - Enable GitHub OAuth
   - Add redirect URL: `https://started.dev/auth/callback`
4. Copy credentials:
   - App ID
   - App Secret
5. Add to environment variables:
   ```bash
   VITE_PRIVY_APP_ID=your-app-id
   PRIVY_APP_ID=your-app-id
   PRIVY_APP_SECRET=your-app-secret
   ```

### Step 3: AI API Keys

Get API keys from:

**Anthropic Claude**
- Go to https://console.anthropic.com
- Create API key
- Add as `ANTHROPIC_API_KEY`

**OpenAI**
- Go to https://platform.openai.com
- Create API key
- Add as `OPENAI_API_KEY`

**Google Gemini**
- Go to https://makersuite.google.com/app/apikey
- Create API key
- Add as `GOOGLE_AI_API_KEY`

**Started API Key** (Custom)
- Generate a secure random string:
  ```bash
  openssl rand -base64 32
  ```
- Add as `STARTED_API_KEY`

### Step 4: Runner Service (Required for command execution)

The IDE delegates command execution to the runner service in [runner-service/](runner-service/).

1. Deploy the runner service on a container host (Fly.io, Render, Railway, ECS)
2. Set environment variables on the runner service:
  ```bash
  RUNNER_SHARED_SECRET=your-shared-secret
  RUNNER_DATA_DIR=/var/lib/started-runner
  RUNNER_SESSION_TTL_MS=1800000
  RUNNER_RATE_LIMIT_PER_MIN=60
  RUNNER_RATE_LIMIT_BURST=20
  ```
3. Expose the runner URL and shared secret to Vercel:
  ```bash
  RUNNER_URL=https://runner.started.dev
  RUNNER_SHARED_SECRET=your-shared-secret
  ```

### Step 5: Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project (first time)
vercel link

# Set environment variables
vercel env add DATABASE_URL
vercel env add PRIVY_APP_ID
vercel env add PRIVY_APP_SECRET
vercel env add ANTHROPIC_API_KEY
vercel env add OPENAI_API_KEY
vercel env add GOOGLE_AI_API_KEY
vercel env add STARTED_API_KEY

# Or add them in Vercel dashboard:
# https://vercel.com/your-team/started-ide/settings/environment-variables

# Deploy to production
vercel --prod
```

### Step 6: Custom Domain Setup

In Vercel dashboard:

1. Go to Project Settings > Domains
2. Add `started.dev`
3. Add `www.started.dev` (optional)
4. Update DNS records at your registrar:
   ```
   Type  Name  Value
   A     @     76.76.21.21
   CNAME www   cname.vercel-dns.com
   ```
5. Wait for DNS propagation (can take up to 48 hours, usually < 1 hour)

### Step 7: GitHub OAuth App Setup

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Started IDE
   - **Homepage URL**: https://started.dev
   - **Authorization callback URL**: `https://started.dev/auth/callback`
4. Click "Register application"
5. Copy Client ID and generate Client Secret
6. Add to Vercel environment variables:
   ```bash
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```
7. Add to Privy dashboard under OAuth providers

## Environment Variables Reference

### Client-Side (VITE_ prefix)

```bash
VITE_PRIVY_APP_ID=your-privy-app-id
VITE_API_URL=  # Leave empty for production (uses relative /api)
VITE_RUNNER_URL=https://runner.started.dev  # Optional
```

### Server-Side (Vercel Functions)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Authentication
PRIVY_APP_ID=your-privy-app-id
PRIVY_APP_SECRET=your-privy-app-secret

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
STARTED_API_KEY=your-custom-api-key

# GitHub OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Stripe (if using payments)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BUILDER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_STUDIO=price_...

# MCP Integrations (optional)
PERPLEXITY_API_KEY=pplx-...
FIRECRAWL_API_KEY=fc-...
MORALIS_API_KEY=...
HELIUS_API_KEY=...

# Runner Service
RUNNER_URL=https://runner.started.dev
RUNNER_SHARED_SECRET=your-shared-secret
```

## Verification

After deployment, verify:

### 1. Homepage Loads
```bash
curl https://started.dev
# Should return 200 OK
```

### 2. API Health Check
```bash
curl https://started.dev/api/health
# Should return {"status": "ok"}
```

### 3. Database Connection
Check Vercel Function logs:
```bash
vercel logs
```
Look for successful database queries.

### 4. Authentication Flow
1. Go to https://started.dev/auth
2. Click "Login with GitHub"
3. Authorize
4. Should redirect to IDE

### 5. AI Gateway
- Open IDE
- Send a test message in chat
- Should receive AI response

## Monitoring

### Vercel Analytics
- Enabled by default
- View at: https://vercel.com/your-team/started-ide/analytics

### Error Tracking

Add Sentry (optional):
```bash
npm install @sentry/react @sentry/node

# Add to Vercel env
SENTRY_DSN=https://...@sentry.io/...
```

### Database Monitoring

For Railway:
```bash
railway logs --service postgresql
```

For Neon:
- View metrics in Neon dashboard

## Scaling

### Database Connection Pooling

Add PgBouncer for production:
```bash
# Update DATABASE_URL to use connection pooling
DATABASE_URL=postgresql://user:pass@pooler.host:5432/db
```

### API Rate Limiting

Implement rate limiting in API routes:
```typescript
// api/_lib/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

### Caching

Add Redis for caching:
```bash
# Add Upstash Redis
npm install @upstash/redis

# Add to Vercel env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Troubleshooting

### Database Connection Errors

```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check SSL requirement
psql "$DATABASE_URL?sslmode=require"
```

### Authentication Not Working

1. Verify Privy App ID matches in both client and server
2. Check redirect URLs in Privy dashboard
3. Check browser console for errors
4. Verify environment variables are set in Vercel

### AI Gateway Errors

1. Check API keys are valid:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "Content-Type: application/json"
   ```
2. Verify quotas haven't been exceeded
3. Check Vercel function logs

### Build Failures

```bash
# Check build logs
vercel logs --since 1h

# Test build locally
vercel build

# Clear cache and rebuild
vercel --force
```

## Backup & Recovery

### Database Backups

Railway (automatic):
- Daily backups retained for 7 days
- Accessible in Railway dashboard

Neon (automatic):
- Point-in-time recovery
- Restore from Neon dashboard

Manual backup:
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Restore from Backup

```bash
psql $DATABASE_URL < backup-20260212.sql
```

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## Support

For issues or questions:
- Check logs: `vercel logs`
- Review MIGRATION.md
- Check GitHub issues
- Contact support@started.dev

## Next Steps

After successful deployment:

1. ✅ Set up monitoring and alerts
2. ✅ Configure backup schedules
3. ✅ Implement rate limiting
4. ✅ Add analytics tracking
5. ✅ Set up error tracking (Sentry)
6. ✅ Configure CDN for assets
7. ✅ Implement caching strategy
8. ✅ Set up CI/CD pipeline
9. ✅ Configure staging environment
10. ✅ Document API endpoints

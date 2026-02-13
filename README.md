# Started IDE

**URL**: https://started.dev

## Overview

Started is a cloud-based AI coding agent IDE. It provides an intelligent development environment with autonomous AI agents, MCP integrations, and real-time collaboration.

## Development

### Prerequisites

- Node.js 20+ (or Bun)
- PostgreSQL database
- Privy account for authentication

### Local Setup

```sh
# Clone the repository
git clone https://github.com/your-org/Started-IDE.git
cd Started-IDE

# Install dependencies
bun install  # or npm install

# Copy environment variables
cp .env.example .env

# Start the development server
bun dev  # or npm run dev
```

### Environment Variables

See `.env.example` for required variables:

- `VITE_PRIVY_APP_ID` - Privy authentication app ID
- `VITE_API_URL` - API base URL (defaults to `/api`)
- `DATABASE_URL` - PostgreSQL connection string

## Tech Stack

- **Frontend**: Vite, React, TypeScript, shadcn/ui, Tailwind CSS
- **Backend**: Vercel Functions (Node.js)
- **Database**: PostgreSQL (self-hosted)
- **Auth**: Privy (Web3 + OAuth)
- **AI**: Anthropic Claude, OpenAI, Google Gemini

## Deployment

This project deploys to Vercel:

```sh
vercel deploy --prod
```

Configure environment variables in the Vercel dashboard under Project Settings > Environment Variables.

## Architecture

- `/api` - Vercel Functions (serverless API routes)
- `/src` - React frontend application
- `/src/lib` - Shared utilities and API client
- `/src/hooks` - React hooks for data fetching and realtime

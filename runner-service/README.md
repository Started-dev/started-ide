# Started Runner Service

Minimal runner service for Started IDE.

## Requirements

- Node.js 24.x

## Setup

```bash
cd runner-service
npm install
npm run dev
```

## Environment Variables

```bash
PORT=8787
RUNNER_DATA_DIR=/var/lib/started-runner
RUNNER_SHARED_SECRET=your-shared-secret
RUNNER_SESSION_TTL_MS=1800000
RUNNER_RATE_LIMIT_PER_MIN=60
RUNNER_RATE_LIMIT_BURST=20
RUNNER_PERSIST_WORKSPACES=true
```

## Endpoints

- `POST /v1/sessions`
- `POST /v1/sessions/:id/upload`
- `POST /v1/sessions/:id/sync`
- `POST /v1/sessions/:id/exec`
- `POST /v1/sessions/:id/kill`
- `DELETE /v1/sessions/:id`
- `GET /v1/sessions/:id/fs`
- `GET /health`
- `GET /metrics`

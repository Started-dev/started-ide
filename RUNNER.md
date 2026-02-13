# Runner Service Specification

> **Status**: MVP (runner service implemented; ready for external deployment)

## Overview

The Runner Service provides isolated command execution for project workspaces. It maintains session-based state (persistent `cwd`) while keeping environment variables scoped per command.

## Architecture

```
┌──────────────┐     POST /v1/sessions/{id}/exec      ┌──────────────────┐
│  Cloud IDE   │ ──────────────────────────────────▶   │  Runner Service  │
│  (Frontend)  │ ◀────────────────────────────────── │  (Container Host) │
│              │     SSE / WebSocket log stream        │                  │
└──────────────┘                                       └──────────────────┘
                                                              │
                                                     ┌───────┴────────┐
                                                     │  Sandboxed     │
                                                     │  Container     │
                                                     │  (per session) │
                                                     └────────────────┘
```

## Endpoints

### `POST /v1/sessions`

Create a new execution session.

**Request:**
```json
{
  "project_id": "proj_abc123",
  "runtime_type": "node" | "python" | "shell"
}
```

**Response:**
```json
{
  "session_id": "session_1234abcd",
  "workspace_path": "/workspace/proj_abc123"
}
```

### `POST /v1/sessions/{id}/exec`

Execute a command in the session's current working directory.

**Request:**
```json
{
  "command": "npm test",
  "timeout_s": 600,
  "reset_cwd": false,
  "env": { "NODE_ENV": "test" }
}
```

**Response (non-streaming):**
```json
{
  "ok": true,
  "stdout": "PASS ...",
  "stderr": "",
  "exit_code": 0,
  "cwd": "/workspace/proj_abc123",
  "duration_ms": 1234
}
```

**Response (streaming via SSE):**
```
event: stdout
data: PASS src/utils.test.ts

event: stderr
data: 

event: exit
data: {"exit_code": 0, "cwd": "/workspace/proj_abc123", "duration_ms": 1234}
```

### `POST /v1/sessions/{id}/upload`

Sync project files into the session's workspace.

**Request:**
```json
{
  "files": [
    { "path": "src/main.ts", "content": "..." },
    { "path": "src/utils.ts", "content": "..." }
  ]
}
```

**Response:**
```json
{ "synced": 2 }
```

### `GET /v1/sessions/{id}/fs?path=...`

Read a file from the session workspace (optional).

**Response:**
```json
{ "content": "file contents here", "size": 1234 }
```

### `POST /v1/sessions/{id}/kill`

Kill the currently running process in the session.

**Response:**
```json
{ "killed": true }
```

### `DELETE /v1/sessions/{id}`

Tear down the session and destroy the container.

**Response:**
```json
{ "destroyed": true }
```

## Execution Model

### Session State
- **`cwd` persists** between commands in the same session
- If a command is `cd <path>`, the runner updates `session.cwd`
- **Environment variables do NOT persist** — each command gets a fresh shell process with a base env
- Optional: support a `.env` file mechanism for persistent env

### Command Execution
```
For each exec request:
  1. Spawn a new shell process (bash -c "command")
  2. Set CWD to session.cwd
  3. Pass base env + request env (merged)
  4. Stream stdout/stderr to client
  5. On exit: capture exit_code, update session.cwd if cd was used
  6. Enforce timeout (kill SIGTERM → SIGKILL after 5s grace)
```

## Resource Limits (MVP Defaults)

| Resource       | Limit            |
|----------------|------------------|
| CPU            | 1 vCPU           |
| Memory         | 2 GB             |
| Timeout        | 10 min (default) |
| Disk           | 512 MB ephemeral |
| Max processes  | 64 (prevent fork bombs) |
| Network        | Disabled by default |

## Security

### Container Isolation
- Each session runs in an isolated container (gVisor/Firecracker recommended for production)
- No shared filesystem between sessions
- No host network access
- Read-only root filesystem with writable workspace overlay

### Network Policy
- **Default**: No outbound network
- **When enabled**: Allowlist-only domains:
  - `registry.npmjs.org` (npm)
  - `pypi.org`, `files.pythonhosted.org` (pip)
  - `github.com` (git clone)
- Block `curl`, `wget`, `ssh`, `nc` by default (defense in depth)

### Command Denylist (Runner-Level)
These are blocked at the runner layer regardless of IDE-level permissions:
```
rm -rf /
rm -rf ~
dd if=
mkfs
chmod 777 /
sudo
mount
chroot
```

### Secrets
- Never mount host secrets into containers
- If project needs env vars (e.g., API keys), pass them per-exec via the `env` field
- Never log env var values in stdout/stderr capture

## Workspace Sync Strategy

### MVP (Current)
1. Store files in DB (IDE file system)
2. On session create: upload all project files via `/upload`
3. After `apply_patch`: re-sync changed files to runner
4. After run completes: runner is for execution only (edits happen in IDE first)

### V1 (Future)
1. Persistent volume per project (cache `node_modules`, `.venv`, etc.)
2. Rsync-like diff sync (only changed files)
3. Bidirectional sync for files generated by commands

## Runtime Templates

| Runtime | Image Base       | Default Command     | Setup Commands                    |
|---------|------------------|---------------------|-----------------------------------|
| Node.js | `node:24-slim`   | `npm test`          | `npm install`                     |
| Python  | `python:3.12-slim` | `python main.py`  | `pip install -r requirements.txt` |
| Shell   | `ubuntu:22.04`   | `bash main.sh`      | —                                 |

## Deployment Options

### Recommended (MVP)
- **Fly.io**: Machines API for on-demand containers, good for session-based workloads
- **Railway**: Simple container deploys with persistent volumes
- **Render**: Background workers with Docker support

### Production Scale
- **Modal**: Serverless containers with GPU support, auto-scaling
- **AWS ECS/Fargate**: Enterprise-grade isolation
- **Custom Kubernetes**: Full control with gVisor runtime class

## Integration Points

### IDE → Runner
```typescript
interface IRunnerClient {
  createSession(projectId: string, runtimeType: RuntimeType): Promise<RunnerSession>;
  exec(sessionId: string, req: ExecRequest): Promise<ExecResult>;
  syncWorkspace(sessionId: string, files: IDEFile[]): Promise<void>;
  killProcess(sessionId: string): Promise<void>;
  destroySession(sessionId: string): Promise<void>;
}
```

### Mock → Real Migration
1. Replace `MockRunnerClient` in `src/lib/runner-client.ts` with `HttpRunnerClient`
2. Set `VITE_RUNNER_URL` environment variable
3. Uncomment the `HttpRunnerClient` class (already scaffolded)
4. Deploy runner service to chosen platform

## Implementation (Current)

The runner is implemented as a standalone service in the repository:

- Service: [runner-service/src/server.js](runner-service/src/server.js)
- Container-ready (Node 24 base recommended)
- Session-based execution with persistent workspaces
- SSE streaming for stdout/stderr + completion events
- Sync endpoint supports hash-aware file diffing
- Session TTL cleanup + basic metrics + in-memory rate limiting

The IDE proxies execution via Vercel Functions:

- [api/run-command.ts](api/run-command.ts) for execution
- [api/apply-patch.ts](api/apply-patch.ts) for patch application

## TODO (Completed)
- [x] Implement real container runner service
- [x] Add SSE/WebSocket streaming for live log output
- [x] Add dependency caching (persistent volumes for node_modules, .venv)
- [x] Add file diff sync (rsync-like) instead of full upload
- [x] Add session TTL and auto-cleanup
- [x] Add metrics and monitoring
- [x] Add rate limiting per user/project

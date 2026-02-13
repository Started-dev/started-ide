import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.RUNNER_DATA_DIR || '/var/lib/started-runner';
const SESSION_TTL_MS = Number(process.env.RUNNER_SESSION_TTL_MS || 30 * 60 * 1000);
const CLEANUP_INTERVAL_MS = Number(process.env.RUNNER_CLEANUP_INTERVAL_MS || 5 * 60 * 1000);
const PERSIST_WORKSPACES = (process.env.RUNNER_PERSIST_WORKSPACES || 'true') === 'true';
const SHARED_SECRET = process.env.RUNNER_SHARED_SECRET || '';
const RATE_LIMIT_PER_MIN = Number(process.env.RUNNER_RATE_LIMIT_PER_MIN || 60);
const RATE_LIMIT_BURST = Number(process.env.RUNNER_RATE_LIMIT_BURST || 20);
const MAX_OUTPUT_BYTES = Number(process.env.RUNNER_MAX_OUTPUT_BYTES || 5 * 1024 * 1024);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

const sessions = new Map();
const metrics = {
  startedAt: Date.now(),
  totalSessions: 0,
  totalExecs: 0,
  totalErrors: 0,
  totalUploads: 0,
  totalSyncs: 0,
};

const rateState = new Map();

const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+\/$/i,
  /\brm\s+-rf\s+~$/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i,
  /\bchmod\s+777\s+\//i,
  /\bsudo\b/i,
  /\bmount\b/i,
  /\bchroot\b/i,
];

function nowMs() {
  return Date.now();
}

function sanitizeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resolveWorkspacePath(workspacePath, filePath) {
  const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const resolved = path.resolve(workspacePath, relative);
  if (!resolved.startsWith(workspacePath)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function getRateKey(req) {
  const userId = req.headers['x-user-id'] || 'anonymous';
  const projectId = req.headers['x-project-id'] || 'default';
  return `${userId}:${projectId}`;
}

function rateLimit(req, res, next) {
  const key = getRateKey(req);
  const state = rateState.get(key) || { tokens: RATE_LIMIT_BURST, lastRefill: nowMs() };

  const elapsed = nowMs() - state.lastRefill;
  if (elapsed > 0) {
    const refill = (elapsed / 60000) * RATE_LIMIT_PER_MIN;
    state.tokens = Math.min(RATE_LIMIT_BURST, state.tokens + refill);
    state.lastRefill = nowMs();
  }

  if (state.tokens < 1) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  state.tokens -= 1;
  rateState.set(key, state);
  next();
}

function requireAuth(req, res, next) {
  if (!SHARED_SECRET) return next();
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== SHARED_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getSessionByProject(projectId, userId) {
  for (const session of sessions.values()) {
    if (session.projectId === projectId && session.userId === userId && session.status === 'ready') {
      return session;
    }
  }
  return null;
}

function createSession({ projectId, runtimeType, userId }) {
  const id = `session-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const workspacePath = path.resolve(DATA_DIR, sanitizeSegment(projectId), sanitizeSegment(userId || 'user'));
  const session = {
    id,
    projectId,
    runtimeType,
    userId,
    workspacePath,
    cwd: workspacePath,
    status: 'ready',
    createdAt: nowMs(),
    lastActivityAt: nowMs(),
    files: new Map(),
    activeProcess: null,
  };
  sessions.set(id, session);
  metrics.totalSessions += 1;
  return session;
}

function isBlockedCommand(command) {
  return BLOCKED_COMMANDS.some(re => re.test(command.trim()));
}

function maybeUpdateCwd(session, command) {
  const trimmed = command.trim();
  const match = trimmed.match(/^cd\s+(.+)$/);
  if (!match) return false;
  const target = match[1].trim().replace(/^['"]|['"]$/g, '');
  const nextPath = path.resolve(session.cwd, target);
  if (!nextPath.startsWith(session.workspacePath)) return false;
  session.cwd = nextPath;
  session.lastActivityAt = nowMs();
  return true;
}

function normalizeCwd(session, cwd) {
  if (!cwd || typeof cwd !== 'string') return;
  let next = cwd;
  if (next.startsWith('/workspace')) {
    next = session.workspacePath + next.slice('/workspace'.length);
  }
  const resolved = path.resolve(session.workspacePath, next.startsWith('/') ? next.slice(1) : next);
  if (resolved.startsWith(session.workspacePath)) {
    session.cwd = resolved;
  }
}

function markSessionActive(session) {
  session.lastActivityAt = nowMs();
}

async function listChangedFiles(session) {
  const changed = [];
  const queue = [session.workspacePath];

  while (queue.length) {
    const current = queue.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        const relPath = '/' + path.relative(session.workspacePath, fullPath).replace(/\\/g, '/');
        const content = await fs.readFile(fullPath, 'utf8');
        const hash = hashContent(content);
        const prev = session.files.get(relPath);
        if (!prev || prev !== hash) {
          changed.push({ path: relPath, content });
          session.files.set(relPath, hash);
        }
      }
    }
  }

  return changed;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeMs: nowMs() - metrics.startedAt, activeSessions: sessions.size });
});

app.get('/metrics', (_req, res) => {
  res.json({
    ...metrics,
    uptimeMs: nowMs() - metrics.startedAt,
    activeSessions: sessions.size,
  });
});

app.use('/v1', rateLimit, requireAuth);

app.post('/v1/sessions', async (req, res) => {
  try {
    const { project_id, runtime_type, user_id } = req.body || {};
    if (!project_id || !runtime_type) {
      return res.status(400).json({ error: 'Missing project_id or runtime_type' });
    }

    const existing = getSessionByProject(project_id, user_id || 'user');
    if (existing) {
      return res.json({ session_id: existing.id, workspace_path: existing.workspacePath });
    }

    const session = createSession({ projectId: project_id, runtimeType: runtime_type, userId: user_id || 'user' });
    await ensureDir(session.workspacePath);
    res.json({ session_id: session.id, workspace_path: session.workspacePath });
  } catch (err) {
    metrics.totalErrors += 1;
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create session' });
  }
});

app.post('/v1/sessions/:id/upload', async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const files = req.body?.files || [];
    if (!Array.isArray(files)) return res.status(400).json({ error: 'Invalid files payload' });

    let synced = 0;
    for (const file of files) {
      const filePath = resolveWorkspacePath(session.workspacePath, file.path);
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content || '', 'utf8');
      session.files.set(file.path.startsWith('/') ? file.path : `/${file.path}`, hashContent(file.content || ''));
      synced += 1;
    }

    metrics.totalUploads += 1;
    markSessionActive(session);
    res.json({ synced });
  } catch (err) {
    metrics.totalErrors += 1;
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to upload files' });
  }
});

app.post('/v1/sessions/:id/sync', async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const files = req.body?.files || [];
    if (!Array.isArray(files)) return res.status(400).json({ error: 'Invalid files payload' });

    let synced = 0;
    let skipped = 0;

    for (const file of files) {
      const normalizedPath = file.path.startsWith('/') ? file.path : `/${file.path}`;
      const content = file.content || '';
      const hash = file.hash || hashContent(content);

      if (session.files.get(normalizedPath) === hash) {
        skipped += 1;
        continue;
      }

      const filePath = resolveWorkspacePath(session.workspacePath, normalizedPath);
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf8');
      session.files.set(normalizedPath, hash);
      synced += 1;
    }

    metrics.totalSyncs += 1;
    markSessionActive(session);
    res.json({ synced, skipped });
  } catch (err) {
    metrics.totalErrors += 1;
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to sync files' });
  }
});

app.get('/v1/sessions/:id/fs', async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const targetPath = req.query?.path;
    if (!targetPath || typeof targetPath !== 'string') return res.status(400).json({ error: 'Missing path' });

    const filePath = resolveWorkspacePath(session.workspacePath, targetPath);
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content, size: Buffer.byteLength(content, 'utf8') });
  } catch (err) {
    metrics.totalErrors += 1;
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read file' });
  }
});

app.post('/v1/sessions/:id/kill', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (session.activeProcess && !session.activeProcess.killed) {
    session.activeProcess.kill('SIGTERM');
    session.activeProcess = null;
  }

  session.status = 'ready';
  markSessionActive(session);
  res.json({ killed: true });
});

app.delete('/v1/sessions/:id', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (session.activeProcess && !session.activeProcess.killed) {
    session.activeProcess.kill('SIGTERM');
  }

  if (!PERSIST_WORKSPACES) {
    await fs.rm(session.workspacePath, { recursive: true, force: true });
  }

  session.status = 'expired';
  sessions.delete(session.id);
  res.json({ destroyed: true });
});

app.post('/v1/sessions/:id/exec', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { command, timeout_s, reset_cwd, env, stream, report_changed_files, cwd } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Missing command' });
  }

  if (isBlockedCommand(command)) {
    return res.status(403).json({ error: 'Command blocked by runner policy' });
  }

  if (reset_cwd) session.cwd = session.workspacePath;
  if (cwd) normalizeCwd(session, cwd);

  if (maybeUpdateCwd(session, command)) {
    return res.json({ ok: true, stdout: '', stderr: '', exit_code: 0, cwd: session.cwd, duration_ms: 0 });
  }

  const startedAt = nowMs();
  metrics.totalExecs += 1;

  const child = spawn(command, {
    cwd: session.cwd,
    env: { ...process.env, ...env },
    shell: true,
  });

  session.activeProcess = child;
  session.status = 'busy';

  let stdout = '';
  let stderr = '';

  const useStream = Boolean(stream);

  if (useStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  function writeStream(type, data) {
    if (!useStream) return;
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }

  function appendOutput(buffer, chunk) {
    const next = buffer + chunk;
    if (next.length > MAX_OUTPUT_BYTES) {
      return next.slice(-MAX_OUTPUT_BYTES);
    }
    return next;
  }

  child.stdout.on('data', chunk => {
    const text = chunk.toString();
    stdout = appendOutput(stdout, text);
    writeStream('stdout', text);
  });

  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    stderr = appendOutput(stderr, text);
    writeStream('stderr', text);
  });

  let timeoutId = null;
  if (timeout_s) {
    timeoutId = setTimeout(() => {
      if (!child.killed) child.kill('SIGTERM');
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
    }, timeout_s * 1000);
  }

  child.on('close', async (code) => {
    if (timeoutId) clearTimeout(timeoutId);
    session.status = 'ready';
    session.activeProcess = null;
    markSessionActive(session);

    const durationMs = nowMs() - startedAt;
    const exitCode = code ?? 1;
    let changedFiles = [];

    if (report_changed_files) {
      try {
        changedFiles = await listChangedFiles(session);
      } catch (err) {
        metrics.totalErrors += 1;
      }
    }

    if (useStream) {
      res.write(`data: ${JSON.stringify({ type: 'done', exitCode, cwd: session.cwd, durationMs, changedFiles })}\n\n`);
      res.end();
    } else {
      res.json({ ok: exitCode === 0, stdout, stderr, exit_code: exitCode, cwd: session.cwd, duration_ms: durationMs, changed_files: changedFiles });
    }
  });
});

setInterval(() => {
  const cutoff = nowMs() - SESSION_TTL_MS;
  for (const session of sessions.values()) {
    if (session.lastActivityAt < cutoff) {
      session.status = 'expired';
      sessions.delete(session.id);
      if (!PERSIST_WORKSPACES) {
        fs.rm(session.workspacePath, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}, CLEANUP_INTERVAL_MS);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Runner service listening on ${PORT}`);
});

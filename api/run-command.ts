/**
 * Runner proxy endpoint
 * Routes command execution to the external runner service
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';

const RUNNER_URL = process.env.RUNNER_URL || process.env.VITE_RUNNER_URL;
const RUNNER_SHARED_SECRET = process.env.RUNNER_SHARED_SECRET || '';

function runnerHeaders(userId: string, projectId?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
  if (projectId) headers['x-project-id'] = projectId;
  if (RUNNER_SHARED_SECRET) headers['Authorization'] = `Bearer ${RUNNER_SHARED_SECRET}`;
  return headers;
}

async function pipeStream(resp: Response, res: VercelResponse) {
  res.status(resp.status);
  res.setHeader('Content-Type', resp.headers.get('content-type') || 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = resp.body?.getReader();
  if (!reader) {
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value));
  }
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!RUNNER_URL) {
    return res.status(503).json({ error: 'runner_unavailable', detail: 'RUNNER_URL not configured' });
  }

  try {
    const { command, cwd, timeout_s, project_id, runtime_type, files, env } = req.body || {};
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Missing command' });
    }

    if (!project_id) {
      return res.status(400).json({ error: 'Missing project_id' });
    }

    const headers = runnerHeaders(user.id, project_id);

    const sessionResp = await fetch(`${RUNNER_URL}/v1/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ project_id, runtime_type: runtime_type || 'node', user_id: user.id }),
    });

    if (!sessionResp.ok) {
      const errText = await sessionResp.text();
      return res.status(502).json({ error: 'runner_unavailable', detail: errText.slice(0, 200) });
    }

    const sessionData = await sessionResp.json() as { session_id: string };
    const sessionId = sessionData.session_id;

    if (Array.isArray(files) && files.length > 0) {
      await fetch(`${RUNNER_URL}/v1/sessions/${sessionId}/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ files }),
      });
    }

    const execResp = await fetch(`${RUNNER_URL}/v1/sessions/${sessionId}/exec`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command, cwd, timeout_s, env, stream: true, report_changed_files: true }),
    });

    const contentType = execResp.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      return pipeStream(execResp, res);
    }

    const data = await execResp.json().catch(() => null);
    if (!data) {
      return res.status(502).json({ error: 'runner_unavailable', detail: 'Invalid runner response' });
    }

    return res.status(execResp.status).json({
      ok: data.ok,
      stdout: data.stdout || '',
      stderr: data.stderr || '',
      exitCode: data.exit_code ?? data.exitCode ?? 1,
      cwd: data.cwd || cwd || '/workspace',
      durationMs: data.duration_ms ?? data.durationMs ?? 0,
      changedFiles: data.changed_files || data.changedFiles,
    });
  } catch (error) {
    return res.status(502).json({ error: 'runner_unavailable', detail: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * OpenClaw installation endpoint
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import crypto from 'node:crypto';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';
import { db, query } from './_lib/db';

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

function generateSlug(): string {
  return crypto.randomBytes(16).toString('hex');
}

async function getRunnerSession(userId: string, projectId: string) {
  if (!RUNNER_URL) throw new Error('RUNNER_URL not configured');
  const resp = await fetch(`${RUNNER_URL}/v1/sessions`, {
    method: 'POST',
    headers: runnerHeaders(userId, projectId),
    body: JSON.stringify({ project_id: projectId, runtime_type: 'node', user_id: userId }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text.slice(0, 200));
  }
  return resp.json() as Promise<{ session_id: string }>;
}

async function execRunnerCommand(userId: string, projectId: string, command: string, env?: Record<string, string>) {
  const session = await getRunnerSession(userId, projectId);
  const resp = await fetch(`${RUNNER_URL}/v1/sessions/${session.session_id}/exec`, {
    method: 'POST',
    headers: runnerHeaders(userId, projectId),
    body: JSON.stringify({ command, env, timeout_s: 600, stream: false, report_changed_files: false }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `Runner error ${resp.status}`);
  }
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = req.body || {};
    }

    const effectiveMethod = (body._method as string)?.toUpperCase() || req.method;

    if (effectiveMethod === 'POST') {
      const { llm_key, project_id } = body as { llm_key?: string; project_id?: string };
      if (!llm_key || !project_id) {
        return res.status(400).json({ error: 'llm_key and project_id required' });
      }

      if (!RUNNER_URL) {
        return res.status(503).json({ error: 'RUNNER_URL not configured' });
      }

      const isOwner = await db.isProjectOwner(user.id, project_id);
      if (!isOwner) {
        return res.status(403).json({ error: 'Project not found or not owned by user' });
      }

      const slug = generateSlug();
      const instanceUrl = `https://${slug}.moltbot.emergent.to`;

      const installation = await db.insert('openclaw_installations', {
        project_id,
        user_id: user.id,
        slug,
        instance_url: instanceUrl,
        status: 'installing',
      });

      const installCommand = 'nohup bash -c "$(curl -fsSL https://moltbot.emergent.to/install.sh)" > /tmp/moltbot_install.log 2>&1 &';
      let runResult: unknown = null;
      try {
        runResult = await execRunnerCommand(user.id, project_id, installCommand, { NEW_LLM_KEY: llm_key });
      } catch (err) {
        runResult = { error: err instanceof Error ? err.message : 'Runner error' };
      }

      return res.status(200).json({
        ok: true,
        install_id: installation.id,
        slug,
        instance_url: instanceUrl,
        status: 'installing',
        run_result: runResult,
      });
    }

    if (effectiveMethod === 'GET') {
      const installId = (req.query.install_id as string) || (body.install_id as string) || null;

      if (!installId) {
        const installations = await query(
          'SELECT * FROM openclaw_installations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
          [user.id]
        );
        return res.status(200).json({ ok: true, installations: installations.rows || [] });
      }

      const installationResult = await query(
        'SELECT * FROM openclaw_installations WHERE id = $1 AND user_id = $2 LIMIT 1',
        [installId, user.id]
      );
      const installation = installationResult.rows[0];
      if (!installation) {
        return res.status(404).json({ error: 'Installation not found' });
      }

      if (installation.status === 'installing') {
        if (!RUNNER_URL) {
          return res.status(503).json({ ok: false, error: 'RUNNER_URL not configured' });
        }
        let logs = '';
        try {
          const logResult = await execRunnerCommand(user.id, installation.project_id, "tail -50 /tmp/moltbot_install.log 2>/dev/null || echo 'Log not available yet'");
          logs = logResult.stdout || logResult.output || '';
        } catch {
          logs = 'Log not available yet';
        }

        const isComplete = logs.includes('Installation complete') || logs.includes('MoltBot is running') || logs.includes('Successfully installed');
        const isFailed = logs.includes('FATAL') || logs.includes('Installation failed') || logs.includes('Error:');

        const newStatus = isComplete ? 'completed' : isFailed ? 'failed' : 'installing';

        await query(
          'UPDATE openclaw_installations SET status = $1, logs = $2, completed_at = $3 WHERE id = $4',
          [newStatus, logs.slice(-5000), newStatus === 'completed' ? new Date().toISOString() : null, installId]
        );

        return res.status(200).json({
          ok: true,
          ...installation,
          status: newStatus,
          logs,
        });
      }

      return res.status(200).json({ ok: true, ...installation });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
}

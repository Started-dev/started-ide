/**
 * MCP OpenClaw API Endpoint
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';

async function openclawFetch(baseUrl: string, path: string, apiKey: string, options: RequestInit = {}) {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error?.message || data.message || `OpenClaw API ${resp.status}`);
  }
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { tool, input, openclaw_url, openclaw_api_key } = req.body || {};
    if (!tool || !openclaw_url || !openclaw_api_key) {
      return res.status(400).json({ error: "missing 'tool', 'openclaw_url', or 'openclaw_api_key'" });
    }

    const baseUrl = openclaw_url as string;
    const apiKey = openclaw_api_key as string;
    let result: unknown;

    switch (tool) {
      case 'openclaw_status':
        result = await openclawFetch(baseUrl, '/api/status', apiKey);
        break;
      case 'openclaw_get_config':
        result = await openclawFetch(baseUrl, '/api/config', apiKey);
        break;
      case 'openclaw_list_skills':
        result = await openclawFetch(baseUrl, '/api/skills', apiKey);
        break;
      case 'openclaw_install_skill': {
        const { skill_name } = input || {};
        if (!skill_name) return res.status(400).json({ error: 'skill_name required' });
        result = await openclawFetch(baseUrl, '/api/skills/install', apiKey, {
          method: 'POST',
          body: JSON.stringify({ name: skill_name }),
        });
        break;
      }
      case 'openclaw_uninstall_skill': {
        const { skill_name } = input || {};
        if (!skill_name) return res.status(400).json({ error: 'skill_name required' });
        result = await openclawFetch(baseUrl, '/api/skills/uninstall', apiKey, {
          method: 'POST',
          body: JSON.stringify({ name: skill_name }),
        });
        break;
      }
      case 'openclaw_send_message': {
        const { message, channel, thread_id } = input || {};
        if (!message) return res.status(400).json({ error: 'message required' });
        const body: Record<string, unknown> = { message };
        if (channel) body.channel = channel;
        if (thread_id) body.thread_id = thread_id;
        result = await openclawFetch(baseUrl, '/api/chat/send', apiKey, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        break;
      }
      case 'openclaw_get_conversations': {
        const limit = input?.limit || 20;
        result = await openclawFetch(baseUrl, `/api/chat/conversations?limit=${limit}`, apiKey);
        break;
      }
      case 'openclaw_get_conversation': {
        const { conversation_id } = input || {};
        if (!conversation_id) return res.status(400).json({ error: 'conversation_id required' });
        result = await openclawFetch(baseUrl, `/api/chat/conversations/${conversation_id}`, apiKey);
        break;
      }
      case 'openclaw_run_task': {
        const { goal, max_steps } = input || {};
        if (!goal) return res.status(400).json({ error: 'goal required' });
        const body: Record<string, unknown> = { goal };
        if (max_steps) body.max_steps = max_steps;
        result = await openclawFetch(baseUrl, '/api/tasks/run', apiKey, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        break;
      }
      case 'openclaw_list_tasks': {
        const limit = input?.limit || 20;
        const status = input?.status ? `&status=${input.status}` : '';
        result = await openclawFetch(baseUrl, `/api/tasks?limit=${limit}${status}`, apiKey);
        break;
      }
      case 'openclaw_get_task': {
        const { task_id } = input || {};
        if (!task_id) return res.status(400).json({ error: 'task_id required' });
        result = await openclawFetch(baseUrl, `/api/tasks/${task_id}`, apiKey);
        break;
      }
      case 'openclaw_cancel_task': {
        const { task_id } = input || {};
        if (!task_id) return res.status(400).json({ error: 'task_id required' });
        result = await openclawFetch(baseUrl, `/api/tasks/${task_id}/cancel`, apiKey, { method: 'POST' });
        break;
      }
      case 'openclaw_search_memory': {
        const { query, limit } = input || {};
        if (!query) return res.status(400).json({ error: 'query required' });
        result = await openclawFetch(baseUrl, '/api/memory/search', apiKey, {
          method: 'POST',
          body: JSON.stringify({ query, limit: limit || 10 }),
        });
        break;
      }
      case 'openclaw_add_memory': {
        const { content, metadata } = input || {};
        if (!content) return res.status(400).json({ error: 'content required' });
        result = await openclawFetch(baseUrl, '/api/memory/add', apiKey, {
          method: 'POST',
          body: JSON.stringify({ content, metadata }),
        });
        break;
      }
      case 'openclaw_list_channels':
        result = await openclawFetch(baseUrl, '/api/channels', apiKey);
        break;
      case 'openclaw_get_channel': {
        const { channel_id } = input || {};
        if (!channel_id) return res.status(400).json({ error: 'channel_id required' });
        result = await openclawFetch(baseUrl, `/api/channels/${channel_id}`, apiKey);
        break;
      }
      case 'openclaw_mcp_invoke': {
        const { mcp_tool, mcp_input } = input || {};
        if (!mcp_tool) return res.status(400).json({ error: 'mcp_tool required' });
        result = await openclawFetch(baseUrl, '/mcp', apiKey, {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: mcp_tool, arguments: mcp_input || {} },
          }),
        });
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return res.status(500).json({ ok: false, error: message });
  }
}

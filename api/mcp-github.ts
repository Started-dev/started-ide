/**
 * MCP GitHub API Endpoint
 * Converts Supabase Edge Function to Vercel Function
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';

async function githubFetch(path: string, token: string, options: RequestInit = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers as Record<string, string> || {}),
    },
  });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.message || `GitHub API ${resp.status}`);
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { tool, input, github_token } = req.body;
    if (!tool || !github_token) {
      return res.status(400).json({ error: "missing 'tool' or 'github_token'" });
    }

    let result: unknown;

    switch (tool) {
      case 'github_list_repos': {
        const page = input?.page || 1;
        const perPage = input?.per_page || 30;
        result = await githubFetch(`/user/repos?sort=updated&page=${page}&per_page=${perPage}`, github_token);
        break;
      }
      // ...add other tools as needed...
      default:
        return res.status(400).json({ error: 'Unknown tool' });
    }

    res.status(200).json({ result });
  } catch (error) {
    console.error('MCP GitHub error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

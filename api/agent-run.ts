/**
 * Agent-Run API Endpoint
 * Converts Supabase Edge Function to Vercel Function
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';
import { db, query } from './_lib/db';

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
    const { projectId, input, model, messages } = req.body;

    // Check project membership
    const isMember = await db.isProjectMember(user.id, projectId);
    if (!isMember) return res.status(403).json({ error: 'Forbidden' });

    // Call AI gateway
    const aiResponse = await fetch(`${process.env.VITE_API_URL || 'https://started.dev/api'}/ai-gateway`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.STARTED_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
    });
    const result = await aiResponse.json() as any;

    // Save agent run
    await db.insert('agent_runs', {
      project_id: projectId,
      user_id: user.id,
      input,
      output: result.choices?.[0]?.message?.content || '',
      created_at: new Date().toISOString(),
      status: 'completed',
    });

    res.json({ output: result.choices?.[0]?.message?.content || '' });
  } catch (error) {
    console.error('Agent-run error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

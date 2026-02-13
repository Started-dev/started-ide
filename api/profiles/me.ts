/**
 * Get current user's profile
 * GET /api/profiles/me
 */
import type { VercelRequest, VercelResponse } from '../_lib/vercel-types';
import { handleOptions } from '../_lib/cors';
import { requireAuth } from '../_lib/auth';
import { query } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const result = await query(
      `SELECT id, display_name, avatar_url, bio, created_at, updated_at 
       FROM profiles WHERE id = $1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

/**
 * Profiles API Endpoint
 * Handles user profile CRUD operations
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions } from './_lib/cors';
import { requireAuth, optionalAuth } from './_lib/auth';
import { db, query } from './_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleOptions(req, res)) return;

  const { method } = req;

  switch (method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handleCreate(req, res);
    case 'PUT':
    case 'PATCH':
      return handleUpdate(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET /api/profiles - Get current user's profile or a specific profile
async function handleGet(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    // Check if requesting own profile or specific ID
    const { id } = req.query;
    const profileId = id || user.id;

    const result = await query(
      `SELECT id, display_name, avatar_url, bio, created_at, updated_at 
       FROM profiles WHERE id = $1`,
      [profileId]
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

// POST /api/profiles - Create a new profile
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { display_name, avatar_url, bio } = req.body;

    // Check if profile already exists
    const existing = await query(
      `SELECT id FROM profiles WHERE id = $1`,
      [user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Profile already exists' });
    }

    // Create new profile
    const result = await query(
      `INSERT INTO profiles (id, display_name, avatar_url, bio, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, display_name, avatar_url, bio, created_at, updated_at`,
      [
        user.id,
        display_name || user.email?.split('@')[0] || 'User',
        avatar_url || null,
        bio || null,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating profile:', error);
    return res.status(500).json({ error: 'Failed to create profile' });
  }
}

// PUT/PATCH /api/profiles - Update current user's profile
async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { display_name, avatar_url, bio } = req.body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(display_name);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(user.id);

    const result = await query(
      `UPDATE profiles SET ${updates.join(', ')} 
       WHERE id = $${paramIndex}
       RETURNING id, display_name, avatar_url, bio, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

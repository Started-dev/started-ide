/**
 * Health Check Endpoint
 * Returns system status
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { query } from './_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const checks: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {} as Record<string, unknown>,
  };

  // Check database connection
  try {
    await query('SELECT 1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (checks.checks as any).database = 'ok';
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (checks.checks as any).database = 'error';
    checks.status = 'degraded';
  }

  // Check environment variables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (checks.checks as any).env = {
    privy: !!process.env.PRIVY_APP_ID,
    database: !!process.env.DATABASE_URL,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_AI_API_KEY,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allEnvPresent = Object.values((checks.checks as any).env).every((v: boolean) => v);
  if (!allEnvPresent) {
    checks.status = 'degraded';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  return res.status(statusCode).json(checks);
}

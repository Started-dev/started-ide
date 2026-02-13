/**
 * Authentication middleware using Privy
 * Replaces Supabase Auth
 */
import type { VercelRequest, VercelResponse } from './vercel-types';

// Privy verification configuration
const PRIVY_APP_ID = process.env.PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;

export interface AuthUser {
  id: string;
  email?: string;
  wallet?: string;
  linkedAccounts: Array<{
    type: string;
    address?: string;
    email?: string;
    username?: string;
  }>;
}

export interface AuthenticatedRequest extends VercelRequest {
  user: AuthUser;
}

/**
 * Verify a Privy access token
 */
export async function verifyPrivyToken(accessToken: string): Promise<AuthUser | null> {
  try {
    // Verify with Privy API
    const response = await fetch('https://auth.privy.io/api/v1/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'privy-app-id': PRIVY_APP_ID,
      },
    });

    if (!response.ok) {
      console.error('Privy verification failed:', response.status);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;

    return {
      id: data.id,
      email: data.email?.address,
      wallet: data.wallet?.address,
      linkedAccounts: data.linked_accounts || [],
    };
  } catch (error) {
    console.error('Privy token verification error:', error);
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
}

/**
 * Authentication middleware
 * Use as: const user = await requireAuth(req, res);
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthUser | null> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return null;
  }

  const user = await verifyPrivyToken(token);

  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  return user;
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function optionalAuth(req: VercelRequest): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;
  return verifyPrivyToken(token);
}

/**
 * Verify Privy token using the server-side verification endpoint
 * More secure - validates with Privy's backend
 */
export async function verifyPrivyTokenServer(accessToken: string): Promise<AuthUser | null> {
  try {
    const credentials = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
    
    const response = await fetch('https://auth.privy.io/api/v1/token/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if (!response.ok) {
      console.error('Privy server verification failed:', response.status);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;
    
    return {
      id: data.user_id,
      email: data.email,
      wallet: data.wallet_address,
      linkedAccounts: [],
    };
  } catch (error) {
    console.error('Privy server token verification error:', error);
    return null;
  }
}

/**
 * Helper to send JSON response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function json(res: VercelResponse, data: any, status = 200): void {
  res.status(status).json(data);
}

/**
 * Helper to send error response
 */
export function errorResponse(res: VercelResponse, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

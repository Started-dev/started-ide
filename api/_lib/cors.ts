/**
 * CORS headers helper for Vercel Functions
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

/**
 * Handle CORS preflight request
 */
export function handleCors(res: any): boolean {
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  return true;
}

/**
 * Return early for OPTIONS requests
 */
export function handleOptions(req: any, res: any): boolean {
  if (req.method === 'OPTIONS') {
    handleCors(res);
    res.status(200).end();
    return true;
  }
  handleCors(res);
  return false;
}

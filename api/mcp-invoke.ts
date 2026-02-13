/**
 * MCP Invoke API Endpoint (Moralis adapter)
 */
import type { VercelRequest, VercelResponse } from './_lib/vercel-types';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';
import { db, query } from './_lib/db';

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2';
const HELIUS_BASE = 'https://api.helius.xyz/v0';

function stableHash(obj: unknown): string {
  const s = JSON.stringify(obj, Object.keys((obj ?? {}) as Record<string, unknown>).sort());
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
}

interface JsonSchema {
  type: 'object';
  required?: string[];
  properties: Record<string, { type: string }>;
}

function assertInput(schema: JsonSchema, input: Record<string, unknown>) {
  if (typeof input !== 'object' || input === null) throw new Error('invalid_input:type');
  for (const k of schema.required ?? []) {
    if (!(k in input)) throw new Error(`invalid_input:missing:${k}`);
  }
  for (const [k, v] of Object.entries(schema.properties)) {
    if (!(k in input)) continue;
    const t = typeof input[k];
    if (v.type === 'number' && t !== 'number') throw new Error(`invalid_input:type:${k}`);
    if (v.type === 'string' && t !== 'string') throw new Error(`invalid_input:type:${k}`);
    if (v.type === 'boolean' && t !== 'boolean') throw new Error(`invalid_input:type:${k}`);
  }
}

type Effect = 'allow' | 'ask' | 'deny';
type Risk = 'read' | 'simulate' | 'write';

async function evalPermission(args: { project_id: string; tool_name: string; risk: Risk }): Promise<{ effect: Effect; reason?: string }> {
  const { project_id, tool_name, risk } = args;
  const rules = await query(
    'SELECT rule_type, subject, effect, reason FROM mcp_permissions WHERE project_id = $1',
    [project_id]
  );
  const list = (rules.rows ?? []) as Array<{ rule_type: string; subject: string; effect: Effect; reason?: string }>;

  const toolRules = list.filter(r => r.rule_type === 'tool' && r.subject === tool_name);
  const denyTool = toolRules.find(r => r.effect === 'deny');
  if (denyTool) return { effect: 'deny', reason: denyTool.reason ?? 'Denied by tool rule' };
  const allowTool = toolRules.find(r => r.effect === 'allow');
  if (allowTool) return { effect: 'allow', reason: allowTool.reason ?? 'Allowed by tool rule' };

  const riskRule = list.find(r => r.rule_type === 'risk' && r.subject === risk);
  if (riskRule) return { effect: riskRule.effect as Effect, reason: riskRule.reason ?? `Rule matched risk=${risk}` };

  const patterns = list.filter(r => r.rule_type === 'pattern');
  for (const r of patterns) {
    if (r.subject.startsWith('prefix:')) {
      const pref = r.subject.slice('prefix:'.length);
      if (tool_name.startsWith(pref)) return { effect: r.effect as Effect, reason: r.reason ?? `Matched prefix ${pref}` };
    }
    if (r.subject.startsWith('re:')) {
      const re = new RegExp(r.subject.slice('re:'.length));
      if (re.test(tool_name)) return { effect: r.effect as Effect, reason: r.reason ?? 'Matched regex' };
    }
  }

  if (risk === 'read') return { effect: 'allow', reason: 'Default allow for read' };
  return { effect: 'ask', reason: 'Default ask for simulate/write' };
}

function moralisHeaders() {
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new Error('MORALIS_API_KEY not configured');
  return { 'content-type': 'application/json', 'X-API-Key': key };
}

function heliusKey() {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY not configured');
  return key;
}

type Cfg = { allowed_chains?: string[]; max_page_size?: number };

function enforceChain(chain: string, cfg: Cfg) {
  const allow = cfg.allowed_chains ?? ['eth', 'base', 'polygon', 'arbitrum', 'optimism', 'bsc'];
  if (!allow.includes(chain)) throw new Error(`chain_not_allowed:${chain}`);
}

async function moralisGet(url: string) {
  const r = await fetch(url, { headers: moralisHeaders() });
  const t = await r.text();
  if (!r.ok) throw new Error(`moralis_error:${r.status}:${t}`);
  try { return JSON.parse(t); } catch { return t; }
}

function heliusUrl(path: string) {
  const key = heliusKey();
  return `${HELIUS_BASE}${path}?api-key=${key}`;
}

async function heliusGet(path: string) {
  const r = await fetch(heliusUrl(path));
  const t = await r.text();
  if (!r.ok) throw new Error(`helius_error:${r.status}:${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return t; }
}

async function heliusPost(path: string, body: unknown) {
  const r = await fetch(heliusUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`helius_error:${r.status}:${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return t; }
}

async function heliusRPC(method: string, params: unknown[]) {
  const key = heliusKey();
  const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await r.json();
  if (data?.error) throw new Error(`helius_rpc_error:${JSON.stringify(data.error)}`);
  return data?.result;
}

const moralisSchemas: Record<string, JsonSchema> = {
  'moralis.getWalletTokenBalances': {
    type: 'object', required: ['address', 'chain'],
    properties: { address: { type: 'string' }, chain: { type: 'string' }, cursor: { type: 'string' } },
  },
  'moralis.getWalletNFTs': {
    type: 'object', required: ['address', 'chain'],
    properties: { address: { type: 'string' }, chain: { type: 'string' }, cursor: { type: 'string' }, limit: { type: 'number' } },
  },
  'moralis.getWalletTokenTransfers': {
    type: 'object', required: ['address', 'chain'],
    properties: { address: { type: 'string' }, chain: { type: 'string' }, cursor: { type: 'string' }, limit: { type: 'number' } },
  },
  'moralis.getTokenPrice': {
    type: 'object', required: ['address', 'chain'],
    properties: { address: { type: 'string' }, chain: { type: 'string' } },
  },
  'moralis.getNFTMetadata': {
    type: 'object', required: ['address', 'token_id', 'chain'],
    properties: { address: { type: 'string' }, token_id: { type: 'string' }, chain: { type: 'string' } },
  },
  'moralis.getContractEvents': {
    type: 'object', required: ['address', 'chain', 'topic'],
    properties: { address: { type: 'string' }, chain: { type: 'string' }, topic: { type: 'string' }, limit: { type: 'number' } },
  },
  'moralis.resolveAddress': {
    type: 'object', required: ['address'],
    properties: { address: { type: 'string' } },
  },
};

const heliusSchemas: Record<string, JsonSchema> = {
  'helius.getParsedTransaction': {
    type: 'object', required: ['signature'],
    properties: { signature: { type: 'string' } },
  },
  'helius.getAccountState': {
    type: 'object', required: ['pubkey'],
    properties: { pubkey: { type: 'string' } },
  },
  'helius.getProgramAccounts': {
    type: 'object', required: ['programId'],
    properties: { programId: { type: 'string' } },
  },
  'helius.getNFTMetadata': {
    type: 'object', required: ['mint'],
    properties: { mint: { type: 'string' } },
  },
  'helius.streamWalletActivity': {
    type: 'object', required: ['wallet'],
    properties: { wallet: { type: 'string' }, type: { type: 'string' }, cursor: { type: 'string' } },
  },
  'helius.getBalance': {
    type: 'object', required: ['pubkey'],
    properties: { pubkey: { type: 'string' } },
  },
  'helius.getTokenAccounts': {
    type: 'object', required: ['owner'],
    properties: { owner: { type: 'string' } },
  },
};

async function invokeMoralisTool(args: { tool_name: string; input: Record<string, unknown>; config: Cfg }) {
  const { tool_name, input, config } = args;
  const schema = moralisSchemas[tool_name];
  if (!schema) throw new Error(`unknown_tool:${tool_name}`);
  assertInput(schema, input);

  const cfg = config ?? {};
  const maxPage = cfg.max_page_size ?? 100;

  switch (tool_name) {
    case 'moralis.getWalletTokenBalances':
      enforceChain(input.chain as string, cfg);
      return moralisGet(`${MORALIS_BASE}/${encodeURIComponent(input.address as string)}/erc20?chain=${encodeURIComponent(input.chain as string)}`);
    case 'moralis.getWalletNFTs': {
      enforceChain(input.chain as string, cfg);
      const limit = Math.min(Number(input.limit ?? 50), maxPage);
      const cursor = input.cursor ? `&cursor=${encodeURIComponent(input.cursor as string)}` : '';
      return moralisGet(`${MORALIS_BASE}/${encodeURIComponent(input.address as string)}/nft?chain=${encodeURIComponent(input.chain as string)}&limit=${limit}${cursor}`);
    }
    case 'moralis.getWalletTokenTransfers': {
      enforceChain(input.chain as string, cfg);
      const limit = Math.min(Number(input.limit ?? 50), maxPage);
      const cursor = input.cursor ? `&cursor=${encodeURIComponent(input.cursor as string)}` : '';
      return moralisGet(`${MORALIS_BASE}/${encodeURIComponent(input.address as string)}/erc20/transfers?chain=${encodeURIComponent(input.chain as string)}&limit=${limit}${cursor}`);
    }
    case 'moralis.getTokenPrice':
      enforceChain(input.chain as string, cfg);
      return moralisGet(`${MORALIS_BASE}/erc20/${encodeURIComponent(input.address as string)}/price?chain=${encodeURIComponent(input.chain as string)}`);
    case 'moralis.getNFTMetadata':
      enforceChain(input.chain as string, cfg);
      return moralisGet(`${MORALIS_BASE}/nft/${encodeURIComponent(input.address as string)}/${encodeURIComponent(input.token_id as string)}?chain=${encodeURIComponent(input.chain as string)}`);
    case 'moralis.getContractEvents': {
      enforceChain(input.chain as string, cfg);
      const limit = Math.min(Number(input.limit ?? 50), maxPage);
      return moralisGet(`${MORALIS_BASE}/${encodeURIComponent(input.address as string)}/events?chain=${encodeURIComponent(input.chain as string)}&topic0=${encodeURIComponent(input.topic as string)}&limit=${limit}`);
    }
    case 'moralis.resolveAddress':
      return { address: input.address, resolved: null, note: 'ENS resolve depends on Moralis plan' };
    default:
      throw new Error(`unhandled_tool:${tool_name}`);
  }
}

async function invokeHeliusTool(args: { tool_name: string; input: Record<string, unknown> }) {
  const { tool_name, input } = args;
  const schema = heliusSchemas[tool_name];
  if (!schema) throw new Error(`unknown_tool:${tool_name}`);
  assertInput(schema, input);

  switch (tool_name) {
    case 'helius.getParsedTransaction':
      return heliusGet(`/transactions/?transactions=${encodeURIComponent(input.signature as string)}`);
    case 'helius.getAccountState':
      return heliusRPC('getAccountInfo', [input.pubkey, { encoding: 'jsonParsed' }]);
    case 'helius.getProgramAccounts': {
      const filters = (input.filters as unknown[]) || [];
      return heliusRPC('getProgramAccounts', [input.programId, { encoding: 'jsonParsed', filters }]);
    }
    case 'helius.getNFTMetadata':
      return heliusPost('/token-metadata', { mintAccounts: [input.mint] });
    case 'helius.streamWalletActivity': {
      const params: string[] = [];
      if (input.type) params.push(`type=${encodeURIComponent(input.type as string)}`);
      if (input.cursor) params.push(`before=${encodeURIComponent(input.cursor as string)}`);
      const query = params.length ? `?${params.join('&')}` : '';
      return heliusGet(`/addresses/${encodeURIComponent(input.wallet as string)}/transactions${query}`);
    }
    case 'helius.getBalance':
      return heliusRPC('getBalance', [input.pubkey]);
    case 'helius.getTokenAccounts':
      return heliusRPC('getTokenAccountsByOwner', [
        input.owner,
        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
        { encoding: 'jsonParsed' },
      ]);
    default:
      throw new Error(`unhandled_tool:${tool_name}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  let body: Record<string, unknown>;
  try {
    body = req.body || {};
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }

  const { project_id, server_key, tool_name, risk = 'read', input = {} } = body as {
    project_id: string; server_key: string; tool_name: string; risk: Risk; input: Record<string, unknown>;
  };

  if (!project_id || !server_key || !tool_name) return res.status(400).json({ ok: false, error: 'missing_fields' });

  const isOwner = await db.isProjectOwner(user.id, project_id);
  if (!isOwner) return res.status(403).json({ ok: false, error: 'forbidden' });

  const serverResult = await query('SELECT id, key FROM mcp_servers WHERE key = $1 LIMIT 1', [server_key]);
  const server = serverResult.rows[0];
  if (!server) return res.status(404).json({ ok: false, error: 'server_not_found' });

  const pmsResult = await query('SELECT is_enabled, config FROM project_mcp_servers WHERE project_id = $1 AND server_id = $2 LIMIT 1', [project_id, server.id]);
  const pms = pmsResult.rows[0];
  if (!pms || !pms.is_enabled) return res.status(403).json({ ok: false, error: 'server_disabled' });

  const perm = await evalPermission({ project_id, tool_name, risk: risk as Risk });
  const inputHash = stableHash({ project_id, server_key, tool_name, risk, input });
  const auditBase = { project_id, user_id: user.id, server_key, tool_name, risk, input_hash: inputHash };

  if (perm.effect !== 'allow') {
    await query(
      `INSERT INTO mcp_audit_log (project_id, user_id, server_key, tool_name, risk, input_hash, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, 'blocked', $7)`,
      [auditBase.project_id, auditBase.user_id, auditBase.server_key, auditBase.tool_name, auditBase.risk, auditBase.input_hash, `needs_${perm.effect}`]
    );
    return res.status(403).json({ ok: false, status: 'needs_approval', effect: perm.effect, reason: perm.reason });
  }

  const startedAt = Date.now();
  try {
    let data: unknown;

    if (server_key === 'moralis') {
      data = await invokeMoralisTool({ tool_name, input: input as Record<string, unknown>, config: (pms.config ?? {}) as Cfg });
    } else if (server_key === 'helius') {
      data = await invokeHeliusTool({ tool_name, input: input as Record<string, unknown> });
    } else {
      return res.status(400).json({ ok: false, error: 'adapter_not_implemented' });
    }

    const latency = Date.now() - startedAt;
    await query(
      `INSERT INTO mcp_audit_log (project_id, user_id, server_key, tool_name, risk, input_hash, status, latency_ms, output_hash, error)
       VALUES ($1, $2, $3, $4, $5, $6, 'ok', $7, $8, NULL)`,
      [auditBase.project_id, auditBase.user_id, auditBase.server_key, auditBase.tool_name, auditBase.risk, auditBase.input_hash, latency, stableHash(data)]
    );

    const now = new Date();
    const ps = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const pe = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

    const existing = await query<{ id: string; mcp_calls: number }>(
      'SELECT id, mcp_calls FROM api_usage_ledger WHERE owner_id = $1 AND period_start = $2 AND period_end = $3 LIMIT 1',
      [user.id, ps, pe]
    );

    if (!existing.rows[0]) {
      await query(
        'INSERT INTO api_usage_ledger (owner_id, period_start, period_end, mcp_calls, plan_key) VALUES ($1, $2, $3, $4, $5)',
        [user.id, ps, pe, 1, 'free']
      );
    } else {
      await query(
        'UPDATE api_usage_ledger SET mcp_calls = $1 WHERE id = $2',
        [(existing.rows[0].mcp_calls || 0) + 1, existing.rows[0].id]
      );
    }

    return res.status(200).json({ ok: true, data, meta: { latency_ms: latency } });
  } catch (e) {
    const latency = Date.now() - startedAt;
    await query(
      `INSERT INTO mcp_audit_log (project_id, user_id, server_key, tool_name, risk, input_hash, status, latency_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, 'error', $7, $8)`,
      [auditBase.project_id, auditBase.user_id, auditBase.server_key, auditBase.tool_name, auditBase.risk, auditBase.input_hash, latency, String(e)]
    );
    return res.status(500).json({ ok: false, error: 'tool_error', detail: String(e) });
  }
}

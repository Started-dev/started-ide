import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Rate Limiting (in-memory, per-project) ───

interface RateBucket {
  count: number;
  windowStart: number;
}

const rateLimits = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120;

function checkRateLimit(projectKey: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const bucket = rateLimits.get(projectKey);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(projectKey, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetIn: RATE_WINDOW_MS };
  }

  bucket.count++;
  const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - bucket.count);
  const resetIn = RATE_WINDOW_MS - (now - bucket.windowStart);

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetIn };
  }

  return { allowed: true, remaining, resetIn };
}

// ─── Audit Log (in-memory ring buffer) ───

interface AuditEntry {
  id: string;
  timestamp: string;
  server: string;
  tool: string;
  opType: 'READ' | 'SIMULATE' | 'WRITE' | 'UNKNOWN';
  permission: 'ALLOW' | 'ASK' | 'DENY';
  status: 'success' | 'error' | 'denied';
  durationMs: number;
  projectKey?: string;
  error?: string;
  inputSummary?: string;
}

const AUDIT_MAX = 500;
const auditLog: AuditEntry[] = [];

function appendAudit(entry: AuditEntry) {
  auditLog.push(entry);
  if (auditLog.length > AUDIT_MAX) auditLog.shift();
}

// ─── Web3 Tool Classification ───

type Web3OpType = 'READ' | 'SIMULATE' | 'WRITE' | 'UNKNOWN';

const TOOL_CLASSIFICATION: Record<string, Web3OpType> = {
  // EVM RPC
  evm_block_number: 'READ', evm_get_balance: 'READ', evm_call: 'READ',
  evm_get_logs: 'READ', evm_get_code: 'READ', evm_estimate_gas: 'READ',
  evm_get_transaction: 'READ', evm_get_transaction_receipt: 'READ',
  evm_get_block: 'READ', evm_chain_id: 'READ', evm_gas_price: 'READ',
  // Contract Intel
  contract_get_abi: 'READ', contract_get_source: 'READ',
  contract_verified_status: 'READ', contract_decode_calldata: 'READ',
  contract_get_creation_tx: 'READ', contract_get_events: 'READ',
  contract_get_transactions: 'READ',
  // Solana
  solana_get_balance: 'READ', solana_get_account_info: 'READ',
  solana_get_transaction: 'READ', solana_get_signatures: 'READ',
  solana_get_token_accounts: 'READ', solana_get_program_accounts: 'READ',
  solana_get_slot: 'READ', solana_get_block_height: 'READ',
  solana_get_recent_blockhash: 'READ', solana_get_supply: 'READ',
  solana_get_epoch_info: 'READ', solana_get_nft_metadata: 'READ',
  // Simulation
  sim_eth_call: 'SIMULATE', sim_estimate_gas: 'SIMULATE',
  sim_trace_call: 'SIMULATE', sim_tenderly_simulate: 'SIMULATE',
  sim_compare_gas: 'SIMULATE', sim_decode_revert: 'SIMULATE',
  // Wallet operations
  wallet_send_transaction: 'WRITE', wallet_sign_message: 'WRITE',
  wallet_get_address: 'READ',
};

function classifyTool(toolName: string): Web3OpType {
  return TOOL_CLASSIFICATION[toolName] || 'UNKNOWN';
}

// ─── Permission Enforcement ───

type PermissionDecision = 'ALLOW' | 'ASK' | 'DENY';

const DENIED_TOOLS = new Set([
  // Private key operations are always blocked at gateway level
  'evm_send_raw_transaction',
  'evm_sign_transaction',
  'solana_sign_transaction',
  'solana_send_transaction',
  'export_private_key',
]);

function evaluatePermission(tool: string, opType: Web3OpType): PermissionDecision {
  if (DENIED_TOOLS.has(tool)) return 'DENY';
  switch (opType) {
    case 'READ': return 'ALLOW';
    case 'SIMULATE': return 'ALLOW';
    case 'WRITE': return 'ASK';
    default: return 'ASK';
  }
}

// ─── Server Routing ───

const WEB3_SERVERS = ['mcp-evm-rpc', 'mcp-contract-intel', 'mcp-solana', 'mcp-tx-simulator'];

function resolveServer(tool: string): string | null {
  if (tool.startsWith('evm_')) return 'mcp-evm-rpc';
  if (tool.startsWith('contract_')) return 'mcp-contract-intel';
  if (tool.startsWith('solana_')) return 'mcp-solana';
  if (tool.startsWith('sim_')) return 'mcp-tx-simulator';
  if (tool.startsWith('wallet_')) return 'client-side'; // Handled in browser
  return null;
}

// ─── Summarize input for audit (strip large payloads) ───

function summarizeInput(input: Record<string, unknown>): string {
  const summary: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.length > 100) {
      summary[k] = v.slice(0, 60) + '…';
    } else if (Array.isArray(v)) {
      summary[k] = `[${v.length} items]`;
    } else {
      summary[k] = v;
    }
  }
  return JSON.stringify(summary);
}

// ─── Main Handler ───

interface GatewayRequest {
  tool: string;
  input: Record<string, unknown>;
  // Credentials pass-through
  rpc_url?: string;
  etherscan_key?: string;
  chain?: string;
  tenderly_key?: string;
  tenderly_account?: string;
  tenderly_project?: string;
  // Meta
  project_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET /audit → return recent audit entries
  if (req.method === "GET") {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const serverFilter = url.searchParams.get("server");
    const opFilter = url.searchParams.get("op_type");
    
    let entries = [...auditLog].reverse();
    if (serverFilter) entries = entries.filter(e => e.server === serverFilter);
    if (opFilter) entries = entries.filter(e => e.opType === opFilter);
    
    return new Response(JSON.stringify({
      ok: true,
      result: {
        entries: entries.slice(0, limit),
        total: auditLog.length,
        rateLimit: {
          maxPerMinute: MAX_REQUESTS_PER_WINDOW,
          windowMs: RATE_WINDOW_MS,
        },
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startMs = Date.now();
  let body: GatewayRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { tool, input, project_id } = body;
  const auditId = crypto.randomUUID();
  const opType = classifyTool(tool);
  const permission = evaluatePermission(tool, opType);
  const server = resolveServer(tool);

  // ─── Validate ───
  if (!tool || !input) {
    return new Response(JSON.stringify({ ok: false, error: "Missing 'tool' or 'input'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!server) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Unknown Web3 tool: ${tool}. Valid prefixes: evm_, contract_, solana_, sim_`,
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Permission Check ───
  if (permission === 'DENY') {
    appendAudit({
      id: auditId, timestamp: new Date().toISOString(),
      server, tool, opType, permission, status: 'denied',
      durationMs: Date.now() - startMs, projectKey: project_id,
      error: 'Blocked by security policy',
      inputSummary: summarizeInput(input),
    });
    return new Response(JSON.stringify({
      ok: false,
      error: `DENIED: Tool '${tool}' is blocked by security policy. This operation is not permitted.`,
      opType,
      permission,
    }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Rate Limit ───
  const rateKey = project_id || 'global';
  const rateResult = checkRateLimit(rateKey);
  if (!rateResult.allowed) {
    appendAudit({
      id: auditId, timestamp: new Date().toISOString(),
      server, tool, opType, permission, status: 'denied',
      durationMs: Date.now() - startMs, projectKey: project_id,
      error: 'Rate limit exceeded',
      inputSummary: summarizeInput(input),
    });
    return new Response(JSON.stringify({
      ok: false,
      error: `Rate limit exceeded (${MAX_REQUESTS_PER_WINDOW}/min). Try again in ${Math.ceil(rateResult.resetIn / 1000)}s.`,
    }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rateResult.resetIn / 1000)),
      },
    });
  }

  // ─── Client-side wallet tools ───
  if (server === 'client-side') {
    const durationMs = Date.now() - startMs;
    appendAudit({
      id: auditId, timestamp: new Date().toISOString(),
      server: 'wallet', tool, opType, permission, status: 'success',
      durationMs, projectKey: project_id,
      inputSummary: summarizeInput(input),
    });
    return new Response(JSON.stringify({
      ok: true,
      result: { _clientSide: true, tool, input },
      _gateway: {
        auditId, opType, permission, server: 'wallet', durationMs,
        rateLimit: { remaining: rateResult.remaining, resetIn: rateResult.resetIn },
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Forward to backend MCP server ───
  try {
    const forwardBody: Record<string, unknown> = { tool, input };

    // Inject credentials based on target server
    switch (server) {
      case 'mcp-evm-rpc':
        forwardBody.rpc_url = body.rpc_url;
        break;
      case 'mcp-contract-intel':
        forwardBody.etherscan_key = body.etherscan_key;
        forwardBody.chain = body.chain || 'ethereum';
        break;
      case 'mcp-solana':
        forwardBody.rpc_url = body.rpc_url;
        break;
      case 'mcp-tx-simulator':
        forwardBody.rpc_url = body.rpc_url;
        forwardBody.tenderly_key = body.tenderly_key;
        forwardBody.tenderly_account = body.tenderly_account;
        forwardBody.tenderly_project = body.tenderly_project;
        break;
    }

    // Call the target edge function
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const response = await fetch(`${supabaseUrl}/functions/v1/${server}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify(forwardBody),
    });

    const result = await response.json();
    const durationMs = Date.now() - startMs;

    appendAudit({
      id: auditId, timestamp: new Date().toISOString(),
      server, tool, opType, permission,
      status: result.ok ? 'success' : 'error',
      durationMs, projectKey: project_id,
      error: result.error,
      inputSummary: summarizeInput(input),
    });

    return new Response(JSON.stringify({
      ...result,
      _gateway: {
        auditId,
        opType,
        permission,
        server,
        durationMs,
        rateLimit: {
          remaining: rateResult.remaining,
          resetIn: rateResult.resetIn,
        },
      },
    }), {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(rateResult.remaining),
        "X-Gateway-OpType": opType,
        "X-Gateway-Server": server,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    appendAudit({
      id: auditId, timestamp: new Date().toISOString(),
      server, tool, opType, permission, status: 'error',
      durationMs, projectKey: project_id,
      error: err.message,
      inputSummary: summarizeInput(input),
    });

    return new Response(JSON.stringify({
      ok: false,
      error: err.message,
      _gateway: { auditId, opType, permission, server, durationMs },
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

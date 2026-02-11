import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Moralis API helpers ───

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

function moralisHeaders(): Record<string, string> {
  const key = Deno.env.get("MORALIS_API_KEY");
  if (!key) throw new Error("MORALIS_API_KEY not configured");
  return { "Content-Type": "application/json", "X-API-Key": key };
}

const DEFAULT_CHAINS = ["eth", "base", "polygon", "arbitrum", "optimism", "bsc", "avalanche"];

function enforceChain(chain: string, allowedChains?: string[]) {
  const allow = allowedChains ?? DEFAULT_CHAINS;
  if (!allow.includes(chain)) throw new Error(`chain_not_allowed:${chain}. Allowed: ${allow.join(", ")}`);
}

async function moralisGet(path: string): Promise<unknown> {
  const url = `${MORALIS_BASE}${path}`;
  const r = await fetch(url, { headers: moralisHeaders() });
  const t = await r.text();
  if (!r.ok) throw new Error(`moralis_error:${r.status}:${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return t; }
}

// ─── Tool handlers ───

const tools: Record<string, (input: Record<string, unknown>, config?: Record<string, unknown>) => Promise<unknown>> = {

  "moralis.getWalletTokenBalances": async (input, config) => {
    const address = input.address as string;
    const chain = input.chain as string;
    if (!address || !chain) throw new Error("Missing address or chain");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    return await moralisGet(`/${encodeURIComponent(address)}/erc20?chain=${encodeURIComponent(chain)}`);
  },

  "moralis.getWalletNFTs": async (input, config) => {
    const address = input.address as string;
    const chain = input.chain as string;
    if (!address || !chain) throw new Error("Missing address or chain");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    const limit = Math.min(Number(input.limit ?? 50), 100);
    const cursor = input.cursor ? `&cursor=${encodeURIComponent(input.cursor as string)}` : "";
    return await moralisGet(`/${encodeURIComponent(address)}/nft?chain=${encodeURIComponent(chain)}&limit=${limit}${cursor}`);
  },

  "moralis.getWalletTokenTransfers": async (input, config) => {
    const address = input.address as string;
    const chain = input.chain as string;
    if (!address || !chain) throw new Error("Missing address or chain");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    const limit = Math.min(Number(input.limit ?? 50), 100);
    const cursor = input.cursor ? `&cursor=${encodeURIComponent(input.cursor as string)}` : "";
    return await moralisGet(`/${encodeURIComponent(address)}/erc20/transfers?chain=${encodeURIComponent(chain)}&limit=${limit}${cursor}`);
  },

  "moralis.getTokenPrice": async (input, config) => {
    const address = input.address as string;
    const chain = input.chain as string;
    if (!address || !chain) throw new Error("Missing address or chain");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    return await moralisGet(`/erc20/${encodeURIComponent(address)}/price?chain=${encodeURIComponent(chain)}`);
  },

  "moralis.getNFTMetadata": async (input, config) => {
    const address = input.address as string;
    const token_id = input.token_id as string;
    const chain = input.chain as string;
    if (!address || !token_id || !chain) throw new Error("Missing address, token_id, or chain");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    return await moralisGet(`/nft/${encodeURIComponent(address)}/${encodeURIComponent(token_id)}?chain=${encodeURIComponent(chain)}`);
  },

  "moralis.getContractEvents": async (input, config) => {
    const address = input.address as string;
    const chain = input.chain as string;
    const topic = input.topic as string;
    if (!address || !chain || !topic) throw new Error("Missing address, chain, or topic");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    const limit = Math.min(Number(input.limit ?? 50), 100);
    return await moralisGet(`/${encodeURIComponent(address)}/events?chain=${encodeURIComponent(chain)}&topic0=${encodeURIComponent(topic)}&limit=${limit}`);
  },

  "moralis.getWalletHistory": async (input, config) => {
    const address = input.address as string;
    const chain = input.chain as string;
    if (!address || !chain) throw new Error("Missing address or chain");
    enforceChain(chain, config?.allowed_chains as string[] | undefined);
    const limit = Math.min(Number(input.limit ?? 25), 100);
    const cursor = input.cursor ? `&cursor=${encodeURIComponent(input.cursor as string)}` : "";
    return await moralisGet(`/wallets/${encodeURIComponent(address)}/history?chain=${encodeURIComponent(chain)}&limit=${limit}${cursor}`);
  },

  "moralis.resolveENS": async (input) => {
    const address = input.address as string;
    if (!address) throw new Error("Missing address");
    return await moralisGet(`/resolve/${encodeURIComponent(address)}/reverse`);
  },
};

// ─── Main Handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tool_name, input, config } = body;

    if (!tool_name || !tools[tool_name]) {
      return json({ ok: false, error: `Unknown tool: ${tool_name}`, available: Object.keys(tools) }, 400);
    }

    const startedAt = Date.now();
    const data = await tools[tool_name](input || {}, config || {});
    const latency = Date.now() - startedAt;

    return json({ ok: true, data, meta: { latency_ms: latency } });
  } catch (e) {
    console.error("mcp-moralis error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

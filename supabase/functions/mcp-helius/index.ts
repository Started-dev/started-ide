import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getHeliusUrl(path: string): string {
  const key = Deno.env.get("HELIUS_API_KEY");
  if (!key) throw new Error("HELIUS_API_KEY not configured");
  return `https://api.helius.xyz/v0${path}?api-key=${key}`;
}

async function heliusGet(path: string) {
  const url = getHeliusUrl(path);
  const r = await fetch(url);
  const t = await r.text();
  if (!r.ok) throw new Error(`helius_error:${r.status}:${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return t; }
}

async function heliusPost(path: string, body: unknown) {
  const key = Deno.env.get("HELIUS_API_KEY");
  if (!key) throw new Error("HELIUS_API_KEY not configured");
  const url = `https://api.helius.xyz/v0${path}?api-key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`helius_error:${r.status}:${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return t; }
}

async function heliusRPC(method: string, params: unknown[]) {
  const key = Deno.env.get("HELIUS_API_KEY");
  if (!key) throw new Error("HELIUS_API_KEY not configured");
  const url = `https://mainnet.helius-rpc.com/?api-key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await r.json();
  if (data.error) throw new Error(`helius_rpc_error:${JSON.stringify(data.error)}`);
  return data.result;
}

// ─── Tool handlers ───

const tools: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  "helius.getParsedTransaction": async (input) => {
    const sig = input.signature as string;
    if (!sig) throw new Error("Missing signature");
    return await heliusGet(`/transactions/?transactions=${encodeURIComponent(sig)}`);
  },

  "helius.getAccountState": async (input) => {
    const pubkey = input.pubkey as string;
    if (!pubkey) throw new Error("Missing pubkey");
    return await heliusRPC("getAccountInfo", [pubkey, { encoding: "jsonParsed" }]);
  },

  "helius.getProgramAccounts": async (input) => {
    const programId = input.programId as string;
    if (!programId) throw new Error("Missing programId");
    const filters = input.filters as unknown[] || [];
    return await heliusRPC("getProgramAccounts", [programId, { encoding: "jsonParsed", filters }]);
  },

  "helius.getNFTMetadata": async (input) => {
    const mint = input.mint as string;
    if (!mint) throw new Error("Missing mint");
    return await heliusPost("/token-metadata", { mintAccounts: [mint] });
  },

  "helius.streamWalletActivity": async (input) => {
    const wallet = input.wallet as string;
    if (!wallet) throw new Error("Missing wallet");
    const type = input.type as string || "";
    const before = input.cursor as string || "";
    let url = `/addresses/${encodeURIComponent(wallet)}/transactions`;
    const params: string[] = [];
    if (type) params.push(`type=${encodeURIComponent(type)}`);
    if (before) params.push(`before=${encodeURIComponent(before)}`);
    if (params.length) url += `?${params.join("&")}`;
    return await heliusGet(url);
  },

  "helius.getBalance": async (input) => {
    const pubkey = input.pubkey as string;
    if (!pubkey) throw new Error("Missing pubkey");
    return await heliusRPC("getBalance", [pubkey]);
  },

  "helius.getTokenAccounts": async (input) => {
    const owner = input.owner as string;
    if (!owner) throw new Error("Missing owner");
    return await heliusRPC("getTokenAccountsByOwner", [
      owner,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tool_name, input } = body;

    if (!tool_name || !tools[tool_name]) {
      return json({ ok: false, error: `Unknown tool: ${tool_name}` }, 400);
    }

    const startedAt = Date.now();
    const data = await tools[tool_name](input || {});
    const latency = Date.now() - startedAt;

    return json({ ok: true, data, meta: { latency_ms: latency } });
  } catch (e) {
    console.error("mcp-helius error:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

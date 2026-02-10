import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ToolRequest {
  tool: string;
  input: Record<string, unknown>;
  rpc_url?: string;
}

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

async function solanaRpc(rpcUrl: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result;
}

async function handleTool(req: ToolRequest): Promise<unknown> {
  const { tool, input } = req;
  const rpc = req.rpc_url || DEFAULT_RPC;

  switch (tool) {
    case "solana_get_balance": {
      const pubkey = input.address as string;
      const result = await solanaRpc(rpc, "getBalance", [pubkey]);
      const val = (result as { value: number }).value;
      return { address: pubkey, lamports: val, sol: val / 1e9 };
    }
    case "solana_get_account_info": {
      const pubkey = input.address as string;
      const encoding = (input.encoding as string) || "jsonParsed";
      const result = await solanaRpc(rpc, "getAccountInfo", [pubkey, { encoding }]);
      return result;
    }
    case "solana_get_transaction": {
      const sig = input.signature as string;
      const result = await solanaRpc(rpc, "getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
      return result;
    }
    case "solana_get_signatures": {
      const pubkey = input.address as string;
      const limit = (input.limit as number) || 10;
      const result = await solanaRpc(rpc, "getSignaturesForAddress", [pubkey, { limit }]);
      return { address: pubkey, signatures: result };
    }
    case "solana_get_token_accounts": {
      const pubkey = input.address as string;
      const programId = (input.program_id as string) || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
      const result = await solanaRpc(rpc, "getTokenAccountsByOwner", [
        pubkey,
        { programId },
        { encoding: "jsonParsed" }
      ]);
      const accounts = ((result as { value: unknown[] }).value || []).map((a: any) => ({
        pubkey: a.pubkey,
        mint: a.account?.data?.parsed?.info?.mint,
        amount: a.account?.data?.parsed?.info?.tokenAmount?.uiAmountString,
        decimals: a.account?.data?.parsed?.info?.tokenAmount?.decimals,
      }));
      return { address: pubkey, tokenAccounts: accounts, count: accounts.length };
    }
    case "solana_get_program_accounts": {
      const programId = input.program_id as string;
      const limit = (input.limit as number) || 10;
      const filters = input.filters as unknown[] || [];
      const result = await solanaRpc(rpc, "getProgramAccounts", [
        programId,
        { encoding: "jsonParsed", filters, dataSlice: { offset: 0, length: 0 } }
      ]);
      const accounts = result as unknown[];
      return { programId, count: accounts?.length || 0, accounts: accounts?.slice(0, limit) };
    }
    case "solana_get_slot": {
      const result = await solanaRpc(rpc, "getSlot");
      return { slot: result };
    }
    case "solana_get_block_height": {
      const result = await solanaRpc(rpc, "getBlockHeight");
      return { blockHeight: result };
    }
    case "solana_get_recent_blockhash": {
      const result = await solanaRpc(rpc, "getLatestBlockhash");
      return result;
    }
    case "solana_get_supply": {
      const result = await solanaRpc(rpc, "getSupply");
      return result;
    }
    case "solana_get_epoch_info": {
      const result = await solanaRpc(rpc, "getEpochInfo");
      return result;
    }
    case "solana_get_nft_metadata": {
      // Fetch account and parse metadata if it's a Metaplex token
      const mint = input.mint as string;
      const info = await solanaRpc(rpc, "getAccountInfo", [mint, { encoding: "jsonParsed" }]);
      return { mint, accountInfo: info, note: "Full Metaplex metadata requires off-chain URI fetching" };
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const result = await handleTool(body);
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

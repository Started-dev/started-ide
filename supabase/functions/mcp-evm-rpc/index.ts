import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ToolRequest {
  tool: string;
  input: Record<string, unknown>;
  rpc_url: string;
  chain_id?: number;
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[] = []): Promise<unknown> {
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
  const { tool, input, rpc_url } = req;
  if (!rpc_url) throw new Error("rpc_url is required");

  switch (tool) {
    case "evm_block_number": {
      const result = await rpcCall(rpc_url, "eth_blockNumber");
      return { blockNumber: parseInt(result as string, 16), hex: result };
    }
    case "evm_get_balance": {
      const addr = input.address as string;
      const block = (input.block as string) || "latest";
      const result = await rpcCall(rpc_url, "eth_getBalance", [addr, block]);
      const wei = BigInt(result as string);
      return { address: addr, balanceWei: wei.toString(), balanceEth: Number(wei) / 1e18 };
    }
    case "evm_call": {
      const to = input.to as string;
      const data = input.data as string;
      const from = (input.from as string) || undefined;
      const block = (input.block as string) || "latest";
      const callObj: Record<string, string> = { to, data };
      if (from) callObj.from = from;
      const result = await rpcCall(rpc_url, "eth_call", [callObj, block]);
      return { result };
    }
    case "evm_get_logs": {
      const filter: Record<string, unknown> = {};
      if (input.address) filter.address = input.address;
      if (input.topics) filter.topics = input.topics;
      filter.fromBlock = (input.fromBlock as string) || "latest";
      filter.toBlock = (input.toBlock as string) || "latest";
      const result = await rpcCall(rpc_url, "eth_getLogs", [filter]);
      return { logs: result, count: Array.isArray(result) ? result.length : 0 };
    }
    case "evm_get_code": {
      const addr = input.address as string;
      const block = (input.block as string) || "latest";
      const result = await rpcCall(rpc_url, "eth_getCode", [addr, block]);
      const code = result as string;
      return { address: addr, code, isContract: code !== "0x" && code !== "0x0" };
    }
    case "evm_estimate_gas": {
      const txObj: Record<string, unknown> = {};
      if (input.from) txObj.from = input.from;
      if (input.to) txObj.to = input.to;
      if (input.data) txObj.data = input.data;
      if (input.value) txObj.value = input.value;
      const result = await rpcCall(rpc_url, "eth_estimateGas", [txObj]);
      return { gasEstimate: parseInt(result as string, 16), hex: result };
    }
    case "evm_get_transaction": {
      const hash = input.hash as string;
      const result = await rpcCall(rpc_url, "eth_getTransactionByHash", [hash]);
      return result;
    }
    case "evm_get_transaction_receipt": {
      const hash = input.hash as string;
      const result = await rpcCall(rpc_url, "eth_getTransactionReceipt", [hash]);
      return result;
    }
    case "evm_get_block": {
      const block = (input.block as string) || "latest";
      const full = input.full_transactions ?? false;
      const result = await rpcCall(rpc_url, "eth_getBlockByNumber", [block, full]);
      return result;
    }
    case "evm_chain_id": {
      const result = await rpcCall(rpc_url, "eth_chainId");
      return { chainId: parseInt(result as string, 16), hex: result };
    }
    case "evm_gas_price": {
      const result = await rpcCall(rpc_url, "eth_gasPrice");
      const wei = BigInt(result as string);
      return { gasPriceWei: wei.toString(), gasPriceGwei: Number(wei) / 1e9 };
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

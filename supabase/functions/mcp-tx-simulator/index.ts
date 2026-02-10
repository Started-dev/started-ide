import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ToolRequest {
  tool: string;
  input: Record<string, unknown>;
  rpc_url?: string;
  tenderly_key?: string;
  tenderly_account?: string;
  tenderly_project?: string;
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
  const { tool, input, rpc_url, tenderly_key, tenderly_account, tenderly_project } = req;

  switch (tool) {
    case "sim_eth_call": {
      // Simulate a transaction without submitting - uses eth_call
      const url = rpc_url;
      if (!url) throw new Error("rpc_url required");
      const txObj: Record<string, unknown> = {};
      if (input.from) txObj.from = input.from;
      if (input.to) txObj.to = input.to;
      if (input.data) txObj.data = input.data;
      if (input.value) txObj.value = input.value;
      if (input.gas) txObj.gas = input.gas;
      const block = (input.block as string) || "latest";
      const result = await rpcCall(url, "eth_call", [txObj, block]);
      return { success: true, returnData: result, note: "Dry-run via eth_call (no state change)" };
    }
    case "sim_estimate_gas": {
      const url = rpc_url;
      if (!url) throw new Error("rpc_url required");
      const txObj: Record<string, unknown> = {};
      if (input.from) txObj.from = input.from;
      if (input.to) txObj.to = input.to;
      if (input.data) txObj.data = input.data;
      if (input.value) txObj.value = input.value;
      const result = await rpcCall(url, "eth_estimateGas", [txObj]);
      const gas = parseInt(result as string, 16);
      // Also fetch gas price for cost estimation
      const gasPrice = await rpcCall(url, "eth_gasPrice");
      const priceWei = BigInt(gasPrice as string);
      const costWei = BigInt(gas) * priceWei;
      return {
        gasEstimate: gas,
        gasPriceGwei: Number(priceWei) / 1e9,
        estimatedCostEth: Number(costWei) / 1e18,
      };
    }
    case "sim_trace_call": {
      // Use debug_traceCall if available (Geth/Erigon nodes)
      const url = rpc_url;
      if (!url) throw new Error("rpc_url required for tracing");
      const txObj: Record<string, unknown> = {};
      if (input.from) txObj.from = input.from;
      if (input.to) txObj.to = input.to;
      if (input.data) txObj.data = input.data;
      if (input.value) txObj.value = input.value;
      const block = (input.block as string) || "latest";
      try {
        const result = await rpcCall(url, "debug_traceCall", [txObj, block, { tracer: "callTracer" }]);
        return { success: true, trace: result };
      } catch (e) {
        return { success: false, error: e.message, note: "debug_traceCall requires archive node with tracing enabled" };
      }
    }
    case "sim_tenderly_simulate": {
      // Tenderly simulation API
      if (!tenderly_key || !tenderly_account || !tenderly_project) {
        throw new Error("Tenderly credentials required (tenderly_key, tenderly_account, tenderly_project)");
      }
      const simBody = {
        network_id: String(input.chain_id || "1"),
        from: input.from,
        to: input.to,
        input: input.data,
        value: input.value || "0",
        gas: input.gas ? Number(input.gas) : 8000000,
        save: input.save ?? false,
        save_if_fails: true,
        simulation_type: "full",
      };
      const res = await fetch(
        `https://api.tenderly.co/api/v1/account/${tenderly_account}/project/${tenderly_project}/simulate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Key": tenderly_key,
          },
          body: JSON.stringify(simBody),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || JSON.stringify(json));
      const tx = json.transaction;
      return {
        success: tx?.status,
        gasUsed: tx?.gas_used,
        logs: tx?.transaction_info?.logs?.length || 0,
        callTrace: tx?.transaction_info?.call_trace ? "available" : "none",
        stateChanges: tx?.transaction_info?.state_diff?.length || 0,
      };
    }
    case "sim_compare_gas": {
      // Compare gas for multiple call variations
      const url = rpc_url;
      if (!url) throw new Error("rpc_url required");
      const calls = input.calls as Array<Record<string, unknown>>;
      if (!calls || !Array.isArray(calls)) throw new Error("calls array required");
      const results = [];
      for (const call of calls) {
        try {
          const result = await rpcCall(url, "eth_estimateGas", [call]);
          results.push({ call, gas: parseInt(result as string, 16), success: true });
        } catch (e) {
          results.push({ call, error: e.message, success: false });
        }
      }
      results.sort((a, b) => (a.gas || Infinity) - (b.gas || Infinity));
      return { comparisons: results, optimal: results[0] };
    }
    case "sim_decode_revert": {
      // Try to simulate and decode revert reason
      const url = rpc_url;
      if (!url) throw new Error("rpc_url required");
      const txObj: Record<string, unknown> = {};
      if (input.from) txObj.from = input.from;
      if (input.to) txObj.to = input.to;
      if (input.data) txObj.data = input.data;
      if (input.value) txObj.value = input.value;
      try {
        const result = await rpcCall(url, "eth_call", [txObj, "latest"]);
        return { reverted: false, returnData: result };
      } catch (e) {
        const msg = e.message;
        // Try to extract revert reason from error
        const hexMatch = msg.match(/0x[0-9a-fA-F]+/);
        let reason = "Unknown revert";
        if (hexMatch) {
          const hex = hexMatch[0];
          // Standard Error(string) selector: 0x08c379a0
          if (hex.startsWith("0x08c379a0") && hex.length > 138) {
            try {
              const strLen = parseInt(hex.slice(74, 138), 16);
              const strHex = hex.slice(138, 138 + strLen * 2);
              reason = new TextDecoder().decode(
                new Uint8Array(strHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
              );
            } catch { reason = msg; }
          } else {
            reason = msg;
          }
        }
        return { reverted: true, reason, rawError: msg };
      }
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

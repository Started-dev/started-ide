import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ToolRequest {
  tool: string;
  input: Record<string, unknown>;
  etherscan_key?: string;
  chain?: string;
}

const EXPLORER_APIS: Record<string, string> = {
  ethereum: "https://api.etherscan.io/api",
  goerli: "https://api-goerli.etherscan.io/api",
  sepolia: "https://api-sepolia.etherscan.io/api",
  polygon: "https://api.polygonscan.com/api",
  bsc: "https://api.bscscan.com/api",
  arbitrum: "https://api.arbiscan.io/api",
  optimism: "https://api-optimistic.etherscan.io/api",
  base: "https://api.basescan.org/api",
  avalanche: "https://api.snowtrace.io/api",
};

async function etherscanCall(chain: string, params: Record<string, string>, apiKey?: string): Promise<unknown> {
  const base = EXPLORER_APIS[chain] || EXPLORER_APIS.ethereum;
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (apiKey) url.searchParams.set("apikey", apiKey);
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "0" && json.message !== "No transactions found") {
    throw new Error(json.result || json.message || "Etherscan error");
  }
  return json.result;
}

function decodeCalldata(data: string, abi: unknown[]): unknown {
  if (!data || data === "0x") return { decoded: false, reason: "empty calldata" };
  const selector = data.slice(0, 10);
  const abiItems = (abi as Array<{ type: string; name?: string; inputs?: Array<{ name: string; type: string }> }>)
    .filter(item => item.type === "function");
  
  // Simple selector matching (first 4 bytes of keccak256 of signature)
  // For full decoding, a proper ABI decoder would be needed
  return {
    selector,
    rawParams: data.slice(10),
    matchedFunctions: abiItems.map(f => f.name),
    note: "Full parameter decoding requires client-side ethers.js or similar"
  };
}

async function handleTool(req: ToolRequest): Promise<unknown> {
  const { tool, input, etherscan_key, chain = "ethereum" } = req;

  switch (tool) {
    case "contract_get_abi": {
      const address = input.address as string;
      const result = await etherscanCall(chain, {
        module: "contract", action: "getabi", address
      }, etherscan_key);
      try {
        const abi = JSON.parse(result as string);
        return { address, chain, abi, functionCount: abi.filter((i: { type: string }) => i.type === "function").length };
      } catch {
        return { address, chain, raw: result, parsed: false };
      }
    }
    case "contract_get_source": {
      const address = input.address as string;
      const result = await etherscanCall(chain, {
        module: "contract", action: "getsourcecode", address
      }, etherscan_key);
      const sources = result as Array<Record<string, string>>;
      if (sources?.length > 0) {
        const s = sources[0];
        return {
          address, chain,
          contractName: s.ContractName,
          compiler: s.CompilerVersion,
          optimization: s.OptimizationUsed === "1",
          runs: parseInt(s.Runs || "0"),
          sourceCode: s.SourceCode?.slice(0, 50000), // truncate large sources
          verified: !!s.ContractName,
          license: s.LicenseType,
          proxy: s.Proxy === "1",
          implementation: s.Implementation || null,
        };
      }
      return { address, chain, verified: false };
    }
    case "contract_verified_status": {
      const address = input.address as string;
      const result = await etherscanCall(chain, {
        module: "contract", action: "getsourcecode", address
      }, etherscan_key);
      const sources = result as Array<Record<string, string>>;
      const verified = sources?.length > 0 && !!sources[0].ContractName;
      return {
        address, chain, verified,
        contractName: verified ? sources[0].ContractName : null,
        compiler: verified ? sources[0].CompilerVersion : null,
        proxy: sources?.[0]?.Proxy === "1",
        implementation: sources?.[0]?.Implementation || null,
      };
    }
    case "contract_decode_calldata": {
      const data = input.data as string;
      const abi = input.abi as unknown[];
      if (!abi) {
        return { selector: data?.slice(0, 10), note: "Provide ABI for full decoding" };
      }
      return decodeCalldata(data, abi);
    }
    case "contract_get_creation_tx": {
      const address = input.address as string;
      const result = await etherscanCall(chain, {
        module: "contract", action: "getcontractcreation",
        contractaddresses: address,
      }, etherscan_key);
      return result;
    }
    case "contract_get_events": {
      const address = input.address as string;
      const fromBlock = (input.fromBlock as string) || "0";
      const toBlock = (input.toBlock as string) || "latest";
      const topic0 = input.topic0 as string;
      const params: Record<string, string> = {
        module: "logs", action: "getLogs",
        address, fromBlock, toBlock,
      };
      if (topic0) params.topic0 = topic0;
      const result = await etherscanCall(chain, params, etherscan_key);
      const logs = result as unknown[];
      return { address, chain, logs, count: logs?.length || 0 };
    }
    case "contract_get_transactions": {
      const address = input.address as string;
      const page = String(input.page || 1);
      const offset = String(input.offset || 20);
      const result = await etherscanCall(chain, {
        module: "account", action: "txlist",
        address, page, offset, sort: "desc",
      }, etherscan_key);
      return { address, chain, transactions: result };
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

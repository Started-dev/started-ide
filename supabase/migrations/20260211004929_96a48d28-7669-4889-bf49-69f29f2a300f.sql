
-- Seed tier0 runner node
INSERT INTO public.runner_nodes (name, base_url, region, trust_tier, capabilities, pricing, status)
VALUES (
  'started-primary',
  'https://runner.started.dev',
  'us-east-1',
  'tier0',
  '{"runtimes": ["node", "deno", "python", "go", "rust"], "toolchains": ["npm", "bun", "cargo", "pip"], "web3": ["foundry", "hardhat", "anchor"], "gpu": false, "maxConcurrency": 8}'::jsonb,
  '{"perMinute": 0, "perGBMinute": 0}'::jsonb,
  'active'
)
ON CONFLICT DO NOTHING;

-- Seed Moralis MCP server
INSERT INTO public.mcp_servers (key, name, description, default_risk, requires_secrets, homepage_url)
VALUES (
  'moralis',
  'Moralis',
  'EVM blockchain data: token balances, NFTs, transfers, prices',
  'read',
  true,
  'https://moralis.io'
)
ON CONFLICT DO NOTHING;

-- Seed Helius MCP server
INSERT INTO public.mcp_servers (key, name, description, default_risk, requires_secrets, homepage_url)
VALUES (
  'helius',
  'Helius',
  'Solana blockchain data: parsed transactions, account state, NFT metadata',
  'read',
  true,
  'https://helius.dev'
)
ON CONFLICT DO NOTHING;

-- Seed Moralis tools
INSERT INTO public.mcp_tools (server_id, tool_name, display_name, description, risk, input_schema, output_schema)
SELECT s.id, t.tool_name, t.display_name, t.description, t.risk, t.input_schema, '{}'::jsonb
FROM public.mcp_servers s,
(VALUES
  ('moralis.getWalletTokenBalances', 'Get Wallet Token Balances', 'Retrieve all ERC-20 token balances for a wallet address', 'read',
   '{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"}},"required":["address","chain"]}'::jsonb),
  ('moralis.getWalletNFTs', 'Get Wallet NFTs', 'Retrieve all NFTs owned by a wallet', 'read',
   '{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"},"cursor":{"type":"string"},"limit":{"type":"number"}},"required":["address","chain"]}'::jsonb),
  ('moralis.getWalletTokenTransfers', 'Get Wallet Token Transfers', 'Retrieve token transfer history for a wallet', 'read',
   '{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"},"cursor":{"type":"string"},"limit":{"type":"number"}},"required":["address","chain"]}'::jsonb),
  ('moralis.getTokenPrice', 'Get Token Price', 'Get current price of a token', 'read',
   '{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"}},"required":["address","chain"]}'::jsonb),
  ('moralis.getNFTMetadata', 'Get NFT Metadata', 'Retrieve metadata for a specific NFT', 'read',
   '{"type":"object","properties":{"address":{"type":"string"},"token_id":{"type":"string"},"chain":{"type":"string"}},"required":["address","token_id","chain"]}'::jsonb)
) AS t(tool_name, display_name, description, risk, input_schema)
WHERE s.key = 'moralis'
ON CONFLICT DO NOTHING;

-- Seed Helius tools
INSERT INTO public.mcp_tools (server_id, tool_name, display_name, description, risk, input_schema, output_schema)
SELECT s.id, t.tool_name, t.display_name, t.description, t.risk, t.input_schema, '{}'::jsonb
FROM public.mcp_servers s,
(VALUES
  ('helius.getParsedTransaction', 'Get Parsed Transaction', 'Retrieve and parse a Solana transaction by signature', 'read',
   '{"type":"object","properties":{"signature":{"type":"string"}},"required":["signature"]}'::jsonb),
  ('helius.getAccountState', 'Get Account State', 'Retrieve current state of a Solana account', 'read',
   '{"type":"object","properties":{"pubkey":{"type":"string"}},"required":["pubkey"]}'::jsonb),
  ('helius.getProgramAccounts', 'Get Program Accounts', 'List accounts owned by a Solana program', 'read',
   '{"type":"object","properties":{"programId":{"type":"string"},"filters":{"type":"array"}},"required":["programId"]}'::jsonb),
  ('helius.getNFTMetadata', 'Get NFT Metadata', 'Retrieve metadata for a Solana NFT by mint address', 'read',
   '{"type":"object","properties":{"mint":{"type":"string"}},"required":["mint"]}'::jsonb),
  ('helius.streamWalletActivity', 'Stream Wallet Activity', 'Get recent transaction activity for a Solana wallet', 'read',
   '{"type":"object","properties":{"wallet":{"type":"string"},"cursor":{"type":"string"}},"required":["wallet"]}'::jsonb)
) AS t(tool_name, display_name, description, risk, input_schema)
WHERE s.key = 'helius'
ON CONFLICT DO NOTHING;

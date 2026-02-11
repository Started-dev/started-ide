import { useState } from 'react';
import {
  Zap, Search, Wallet, Server, ArrowRight, Loader2,
  Shield, Eye, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIDE } from '@/contexts/IDEContext';

type Chain = 'evm' | 'solana';

interface ProtocolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  meta?: { latency_ms: number };
}

export function ProtocolZone() {
  const { project } = useIDE();
  const [chain, setChain] = useState<Chain>('evm');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProtocolResult | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const invokeMCP = async (serverKey: string, toolName: string, input: Record<string, unknown>) => {
    setLoading(true);
    setResult(null);
    setActiveAction(toolName);

    try {
      const { data, error } = await supabase.functions.invoke('mcp-invoke', {
        body: {
          project_id: project.id,
          server_key: serverKey,
          tool_name: toolName,
          risk: 'read',
          input,
        },
      });

      if (error) {
        setResult({ ok: false, error: error.message });
      } else {
        setResult(data as ProtocolResult);
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' });
    }

    setLoading(false);
  };

  const inspectContract = () => {
    if (!address.trim()) return;
    if (chain === 'evm') {
      invokeMCP('moralis', 'moralis.getWalletTokenBalances', { address, chain: 'eth' });
    } else {
      invokeMCP('helius', 'helius.getAccountState', { pubkey: address });
    }
  };

  const analyzeWallet = () => {
    if (!address.trim()) return;
    if (chain === 'evm') {
      invokeMCP('moralis', 'moralis.getWalletTokenTransfers', { address, chain: 'eth', limit: 20 });
    } else {
      invokeMCP('helius', 'helius.streamWalletActivity', { wallet: address });
    }
  };

  const getTokenPrice = () => {
    if (!address.trim()) return;
    if (chain === 'evm') {
      invokeMCP('moralis', 'moralis.getTokenPrice', { address, chain: 'eth' });
    } else {
      invokeMCP('helius', 'helius.getBalance', { pubkey: address });
    }
  };

  const getNFTs = () => {
    if (!address.trim()) return;
    if (chain === 'evm') {
      invokeMCP('moralis', 'moralis.getWalletNFTs', { address, chain: 'eth', limit: 10 });
    } else {
      invokeMCP('helius', 'helius.getNFTMetadata', { mint: address });
    }
  };

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider">Protocol Zone</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <Shield className="h-2.5 w-2.5" />
            Read-only
          </span>
        </div>
      </div>

      {/* Chain Selector */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
        <button
          onClick={() => { setChain('evm'); setResult(null); }}
          className={`px-3 py-1 text-xs rounded-sm transition-colors ${
            chain === 'evm' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:bg-accent/30'
          }`}
        >
          EVM (Moralis)
        </button>
        <button
          onClick={() => { setChain('solana'); setResult(null); }}
          className={`px-3 py-1 text-xs rounded-sm transition-colors ${
            chain === 'solana' ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:bg-accent/30'
          }`}
        >
          Solana (Helius)
        </button>
      </div>

      {/* Address Input */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex gap-1.5">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={chain === 'evm' ? '0x address or contract...' : 'Solana pubkey or mint...'}
            className="flex-1 bg-background text-sm font-mono text-foreground px-2 py-1.5 rounded-sm border border-border outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-3 py-2 border-b border-border space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={inspectContract}
            disabled={loading || !address.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-accent/30 hover:bg-accent/50 rounded-sm transition-colors disabled:opacity-40"
          >
            <Search className="h-3 w-3" />
            {chain === 'evm' ? 'Inspect Contract' : 'Account State'}
          </button>
          <button
            onClick={analyzeWallet}
            disabled={loading || !address.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-accent/30 hover:bg-accent/50 rounded-sm transition-colors disabled:opacity-40"
          >
            <Wallet className="h-3 w-3" />
            Analyze Wallet
          </button>
          <button
            onClick={getTokenPrice}
            disabled={loading || !address.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-accent/30 hover:bg-accent/50 rounded-sm transition-colors disabled:opacity-40"
          >
            <Zap className="h-3 w-3" />
            {chain === 'evm' ? 'Token Price' : 'Balance'}
          </button>
          <button
            onClick={getNFTs}
            disabled={loading || !address.trim()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-accent/30 hover:bg-accent/50 rounded-sm transition-colors disabled:opacity-40"
          >
            <Eye className="h-3 w-3" />
            NFT Data
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-xs text-muted-foreground">
              Querying {chain === 'evm' ? 'Moralis' : 'Helius'}...
            </span>
          </div>
        )}

        {!loading && result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              {result.ok ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Shield className="h-3 w-3" />
                  Success
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400">
                  Error
                </span>
              )}
              {activeAction && (
                <span className="text-muted-foreground font-mono">{activeAction}</span>
              )}
              {result.meta?.latency_ms && (
                <span className="text-muted-foreground">{result.meta.latency_ms}ms</span>
              )}
            </div>

            {result.ok && result.data ? (
              <pre className="text-[11px] font-mono text-foreground/80 bg-background/50 p-2 rounded-sm border border-border overflow-auto max-h-[400px] whitespace-pre-wrap">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            ) : result.error ? (
              <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded-sm border border-red-500/20">
                {result.error}
              </div>
            ) : null}
          </div>
        )}

        {!loading && !result && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Server className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-xs">Enter an address and run a query</p>
            <p className="text-[10px] mt-1 opacity-60">
              All queries are read-only and logged to the audit trail
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

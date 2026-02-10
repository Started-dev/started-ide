import { Wallet, Unplug, Copy, Check, ExternalLink, AlertCircle, Loader2, ArrowRightLeft } from 'lucide-react';
import { useWallet } from '@/hooks/use-wallet';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface WalletConnectProps {
  compact?: boolean;
}

export function WalletConnect({ compact }: WalletConnectProps) {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
    : '';

  // ── Not connected ──
  if (!wallet.connected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Wallet Connection
          </span>
        </div>

        {!wallet.hasProvider && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-sm bg-ide-warning/10 text-ide-warning text-[11px]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">No wallet detected</p>
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline flex items-center gap-0.5 mt-0.5"
              >
                Install MetaMask <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        )}

        {wallet.hasProvider && (
          <Button
            size="sm"
            onClick={wallet.connect}
            disabled={wallet.connecting}
            className="h-7 text-xs w-full gap-1.5"
          >
            {wallet.connecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wallet className="h-3 w-3" />
            )}
            {wallet.connecting ? 'Connecting…' : 'Connect MetaMask'}
          </Button>
        )}

        {wallet.error && (
          <p className="text-[10px] text-destructive">{wallet.error}</p>
        )}
      </div>
    );
  }

  // ── Connected (compact) ──
  if (compact) {
    return (
      <button
        onClick={copyAddress}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-ide-success/10 text-ide-success text-[11px] font-mono hover:bg-ide-success/15 transition-colors"
        title={wallet.address || ''}
      >
        <div className="h-2 w-2 rounded-full bg-ide-success animate-pulse" />
        {shortAddress}
      </button>
    );
  }

  // ── Connected (full) ──
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-ide-success" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Wallet Connected
          </span>
        </div>
        <button
          onClick={wallet.disconnect}
          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
        >
          <Unplug className="h-2.5 w-2.5" />
          Disconnect
        </button>
      </div>

      {/* Address */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-muted">
        <div className="h-2 w-2 rounded-full bg-ide-success shrink-0" />
        <span className="text-xs font-mono text-foreground flex-1 truncate" title={wallet.address || ''}>
          {shortAddress}
        </span>
        <button
          onClick={copyAddress}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Copy address"
        >
          {copied ? <Check className="h-3 w-3 text-ide-success" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Chain + Balance */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1">
          <ArrowRightLeft className="h-2.5 w-2.5" />
          {wallet.chainName}
        </span>
        {wallet.balance && (
          <span className="font-mono">{wallet.balance} ETH</span>
        )}
      </div>

      {wallet.error && (
        <p className="text-[10px] text-destructive px-1">{wallet.error}</p>
      )}
    </div>
  );
}

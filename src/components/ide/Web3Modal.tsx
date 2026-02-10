import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Zap, Activity, Search, Globe, Coins, Network } from 'lucide-react';

interface Web3ModalProps {
  open: boolean;
  onClose: () => void;
  onOpenTxBuilder: () => void;
  onOpenMCP: (serverKey: string) => void;
}

const integrations = [
  {
    key: 'tx-builder',
    label: 'Transaction Builder',
    description: 'Build, encode & batch EVM transactions with ABI support.',
    icon: Zap,
    type: 'component' as const,
  },
  {
    key: 'tx-simulator',
    label: 'TX Simulator',
    description: 'Simulate transactions and preview state changes before signing.',
    icon: Activity,
    type: 'mcp' as const,
    mcpKey: 'tx-simulator',
  },
  {
    key: 'contract-intel',
    label: 'Contract Intel',
    description: 'Inspect verified contracts, read storage, and decode ABIs.',
    icon: Search,
    type: 'mcp' as const,
    mcpKey: 'contract-intel',
  },
  {
    key: 'evm-rpc',
    label: 'EVM RPC',
    description: 'Direct JSON-RPC calls to any EVM-compatible chain.',
    icon: Network,
    type: 'mcp' as const,
    mcpKey: 'evm-rpc',
  },
  {
    key: 'solana',
    label: 'Solana',
    description: 'Interact with Solana programs, accounts, and tokens.',
    icon: Coins,
    type: 'mcp' as const,
    mcpKey: 'solana',
  },
  {
    key: 'web3-gateway',
    label: 'Web3 Gateway',
    description: 'Unified gateway with rate limiting and audit logging.',
    icon: Globe,
    type: 'mcp' as const,
    mcpKey: 'web3-gateway',
  },
];

export function Web3Modal({ open, onClose, onOpenTxBuilder, onOpenMCP }: Web3ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Web3 Integrations</DialogTitle>
          <DialogDescription>Select a Web3 tool to open or configure.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          {integrations.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (item.type === 'component') {
                    onClose();
                    onOpenTxBuilder();
                  } else {
                    onClose();
                    onOpenMCP(item.mcpKey!);
                  }
                }}
                className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card text-left hover:border-primary/40 hover:bg-accent/30 transition-colors"
              >
                <div className="shrink-0 mt-0.5 p-2 rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  {item.type === 'mcp' && (
                    <span className="inline-block text-[10px] mt-1.5 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      Configure in MCP
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

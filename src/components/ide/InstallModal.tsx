import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Cloud, Package, Database, Globe, Bot, Shield, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface InstallModalProps {
  open: boolean;
  onClose: () => void;
  onOpenOpenClaw: () => void;
}

const installables = [
  {
    key: 'openclaw',
    label: 'OpenClaw / MoltBot',
    description: 'Deploy an autonomous agent instance with one-click provisioning.',
    icon: Cloud,
    status: 'available' as const,
  },
  {
    key: 'postgres',
    label: 'Managed Postgres',
    description: 'Spin up a dedicated PostgreSQL instance with backups and monitoring.',
    icon: Database,
    status: 'coming-soon' as const,
  },
  {
    key: 'edge-gateway',
    label: 'Edge Gateway',
    description: 'Deploy a global edge proxy with rate limiting, caching, and auth middleware.',
    icon: Globe,
    status: 'coming-soon' as const,
  },
  {
    key: 'cron-workers',
    label: 'Cron Workers',
    description: 'Schedule recurring tasks and background jobs with observability.',
    icon: Bot,
    status: 'coming-soon' as const,
  },
  {
    key: 'vault',
    label: 'Secrets Vault',
    description: 'Encrypted key-value store for API keys, tokens, and sensitive config.',
    icon: Shield,
    status: 'coming-soon' as const,
  },
  {
    key: 'analytics',
    label: 'Project Analytics',
    description: 'Usage metrics, error tracking, and performance dashboards.',
    icon: BarChart3,
    status: 'coming-soon' as const,
  },
];

export function InstallModal({ open, onClose, onOpenOpenClaw }: InstallModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Install Services</DialogTitle>
          <DialogDescription>
            Deploy full services to your project. These are standalone deployments, not MCP protocol connections.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-2 overflow-y-auto pr-1">
          {installables.map((item) => {
            const Icon = item.icon;
            const isAvailable = item.status === 'available';
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (!isAvailable) return;
                  onClose();
                  onOpenOpenClaw();
                }}
                disabled={!isAvailable}
                className={`flex items-start gap-3 w-full p-4 rounded-lg border text-left transition-colors ${
                  isAvailable
                    ? 'border-border bg-card hover:border-primary/40 hover:bg-accent/30 cursor-pointer'
                    : 'border-border/50 bg-card/50 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="shrink-0 mt-0.5 p-2 rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    {!isAvailable && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground border-muted-foreground/30">
                        Soon
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </button>
            );
          })}
          {/* Future slot */}
          <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border text-muted-foreground">
            <Package className="h-4 w-4" />
            <span className="text-xs">Request a service at started.dev/feedback</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

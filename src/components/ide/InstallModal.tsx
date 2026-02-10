import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Cloud, Package } from 'lucide-react';

interface InstallModalProps {
  open: boolean;
  onClose: () => void;
  onOpenOpenClaw: () => void;
}

const installables = [
  {
    key: 'openclaw',
    label: 'OpenClaw / MoltBot',
    description: 'Deploy an autonomous agent instance with one-click provisioning. Separate from MCP protocol connections.',
    icon: Cloud,
  },
];

export function InstallModal({ open, onClose, onOpenOpenClaw }: InstallModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Install Services</DialogTitle>
          <DialogDescription>
            Deploy full services to your project. These are standalone deployments, not MCP protocol connections.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {installables.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onClose();
                  onOpenOpenClaw();
                }}
                className="flex items-start gap-3 w-full p-4 rounded-lg border border-border bg-card text-left hover:border-primary/40 hover:bg-accent/30 transition-colors"
              >
                <div className="shrink-0 mt-0.5 p-2 rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </button>
            );
          })}
          {/* Future install slots */}
          <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border text-muted-foreground">
            <Package className="h-4 w-4" />
            <span className="text-xs">More installable services coming soon</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

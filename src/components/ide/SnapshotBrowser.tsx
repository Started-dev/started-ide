import { useState, useEffect } from 'react';
import { X, Clock, RotateCcw, Save, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Snapshot } from '@/hooks/use-file-snapshots';

interface SnapshotBrowserProps {
  snapshots: Snapshot[];
  loading: boolean;
  onClose: () => void;
  onCreateSnapshot: (label?: string) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
}

export function SnapshotBrowser({
  snapshots,
  loading,
  onClose,
  onCreateSnapshot,
  onRestoreSnapshot,
}: SnapshotBrowserProps) {
  const [label, setLabel] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleCreate = () => {
    onCreateSnapshot(label.trim() || undefined);
    setLabel('');
  };

  const handleRestore = (id: string) => {
    if (confirmId === id) {
      onRestoreSnapshot(id);
      setConfirmId(null);
    } else {
      setConfirmId(id);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">File Snapshots</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Create snapshot */}
        <div className="px-4 py-3 border-b border-border">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">
            Save current state
          </label>
          <div className="flex gap-1.5">
            <Input
              placeholder="Optional label (e.g. before refactor)"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="h-7 text-xs bg-background"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Button size="sm" onClick={handleCreate} className="h-7 text-xs px-2.5 gap-1">
              <Save className="h-3 w-3" />
              Save
            </Button>
          </div>
        </div>

        {/* Snapshot list */}
        <div className="max-h-[350px] overflow-auto p-2 space-y-1">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && snapshots.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No snapshots yet. Save one above to get started.
            </div>
          )}

          {snapshots.map(snap => (
            <div
              key={snap.id}
              className="flex items-center gap-3 px-3 py-2 border border-border rounded-md hover:bg-accent/30 transition-colors"
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{snap.label}</div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span>{formatDate(snap.created_at)}</span>
                  <span className="flex items-center gap-0.5">
                    <FileText className="h-2.5 w-2.5" />
                    {snap.fileCount} files
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant={confirmId === snap.id ? 'destructive' : 'outline'}
                onClick={() => handleRestore(snap.id)}
                className="h-6 text-[10px] px-2 gap-1 shrink-0"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                {confirmId === snap.id ? 'Confirm?' : 'Restore'}
              </Button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            Snapshots save a full copy of all project files. Restoring replaces all current files.
          </p>
        </div>
      </div>
    </div>
  );
}

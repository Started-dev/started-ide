import { useState } from 'react';
import { Check, X, Play, Copy, FileCode, ChevronDown, ChevronRight, AlertTriangle, Ban } from 'lucide-react';
import { PatchPreview as PatchPreviewType, ParsedPatch, DiffLine } from '@/types/tools';

interface PatchPreviewProps {
  patch: PatchPreviewType;
  onApply: () => void;
  onApplyAndRun: (command: string) => void;
  onCancel: () => void;
  onCopyPatch: () => void;
  suggestedCommand?: string;
}

export function PatchPreviewPanel({ patch, onApply, onApplyAndRun, onCancel, onCopyPatch, suggestedCommand }: PatchPreviewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
  const [showFullDiff, setShowFullDiff] = useState(false);

  const toggleFile = (index: number) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const getTotalStats = () => {
    let adds = 0, removes = 0;
    for (const p of patch.patches) {
      for (const hunk of p.hunks) {
        for (const line of hunk.lines) {
          if (line.type === 'add') adds++;
          if (line.type === 'remove') removes++;
        }
      }
    }
    return { adds, removes };
  };

  const getStats = (p: ParsedPatch) => {
    let adds = 0, removes = 0;
    for (const hunk of p.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') adds++;
        if (line.type === 'remove') removes++;
      }
    }
    return { adds, removes };
  };

  const totalStats = getTotalStats();

  // ─── Compact chip for applied/failed/cancelled ───
  if (patch.status !== 'preview' && !showFullDiff) {
    const statusConfig = {
      applied: { icon: <Check className="h-3 w-3" />, label: 'Applied', color: 'text-ide-success', bg: 'bg-ide-success/10', border: 'border-ide-success/20' },
      failed: { icon: <AlertTriangle className="h-3 w-3" />, label: 'Failed', color: 'text-ide-error', bg: 'bg-ide-error/10', border: 'border-ide-error/20' },
      cancelled: { icon: <Ban className="h-3 w-3" />, label: 'Cancelled', color: 'text-muted-foreground', bg: 'bg-muted/50', border: 'border-border' },
    }[patch.status];

    if (!statusConfig) return null;

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${statusConfig.border} ${statusConfig.bg} animate-in slide-in-from-bottom-2 duration-200`}>
        <span className={`flex items-center gap-1 text-xs font-medium ${statusConfig.color}`}>
          {statusConfig.icon}
          {statusConfig.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {patch.patches.length} file{patch.patches.length !== 1 ? 's' : ''}
          {' · '}
          <span className="text-ide-success">+{totalStats.adds}</span>
          {' '}
          <span className="text-ide-error">-{totalStats.removes}</span>
        </span>
        {patch.error && (
          <span className="text-[10px] text-ide-error ml-1 truncate max-w-[200px]" title={patch.error}>
            {patch.error}
          </span>
        )}
        <button
          onClick={() => setShowFullDiff(true)}
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        {patch.status === 'failed' && (
          <button
            onClick={onCopyPatch}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // ─── Full preview card ───
  const accentBorder = patch.status === 'preview'
    ? 'border-l-2 border-l-primary'
    : patch.status === 'applied'
      ? 'border-l-2 border-l-ide-success'
      : patch.status === 'failed'
        ? 'border-l-2 border-l-ide-error'
        : '';

  return (
    <div className={`rounded-md border border-border bg-card animate-in slide-in-from-bottom-3 duration-300 overflow-hidden ${accentBorder}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-ide-panel-header border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
            Patch
          </span>
          <span className="text-[10px] text-muted-foreground">
            {patch.patches.length} file{patch.patches.length !== 1 ? 's' : ''}
            {' · '}
            <span className="text-ide-success">+{totalStats.adds}</span>
            {' '}
            <span className="text-ide-error">-{totalStats.removes}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {patch.status === 'preview' && (
            <>
              <button
                onClick={onApply}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-ide-success/15 text-ide-success rounded-sm hover:bg-ide-success/25 transition-colors font-medium"
              >
                <Check className="h-3 w-3" />
                Apply
              </button>
              {suggestedCommand && (
                <button
                  onClick={() => onApplyAndRun(suggestedCommand)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-primary/15 text-primary rounded-sm hover:bg-primary/25 transition-colors font-medium"
                >
                  <Play className="h-3 w-3" />
                  Apply + Run
                </button>
              )}
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-ide-error/15 text-ide-error rounded-sm hover:bg-ide-error/25 transition-colors font-medium"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}

          {patch.status !== 'preview' && (
            <button
              onClick={() => setShowFullDiff(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {patch.error && (
        <div className="px-3 py-1.5 bg-ide-error/5 border-b border-ide-error/20 text-[11px] text-ide-error">
          {patch.error}
        </div>
      )}

      {/* Diff content */}
      <div className="max-h-[300px] overflow-auto">
        {patch.patches.map((p, fileIdx) => {
          const stats = getStats(p);
          const isExpanded = expandedFiles.has(fileIdx);
          const isNewFile = p.oldFile === '/dev/null';

          return (
            <div key={fileIdx}>
              <div
                className="flex items-center gap-2 px-3 py-1 bg-muted/50 border-b border-border cursor-pointer hover:bg-muted transition-colors"
                onClick={() => toggleFile(fileIdx)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
                <FileCode className="h-3 w-3 text-ide-info" />
                <span className="text-[11px] font-mono text-foreground">
                  {p.newFile}
                </span>
                {isNewFile && (
                  <span className="text-[9px] px-1 py-0.5 bg-ide-success/15 text-ide-success rounded-sm font-semibold">NEW</span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  <span className="text-ide-success">+{stats.adds}</span>
                  {' '}
                  <span className="text-ide-error">-{stats.removes}</span>
                </span>
              </div>

              {isExpanded && (
                <div className="font-mono text-[11px] leading-[18px]">
                  {p.hunks.map((hunk, hunkIdx) => (
                    <div key={hunkIdx}>
                      <div className="px-3 py-0.5 bg-ide-info/5 text-ide-info text-[10px]">
                        @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                      </div>
                      {hunk.lines.map((line, lineIdx) => (
                        <DiffLineRow key={lineIdx} line={line} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const config = {
    add: { prefix: '+', bg: 'bg-ide-success/8', text: 'text-ide-success', gutter: 'bg-ide-success/15' },
    remove: { prefix: '-', bg: 'bg-ide-error/8', text: 'text-ide-error', gutter: 'bg-ide-error/15' },
    context: { prefix: ' ', bg: '', text: 'text-muted-foreground', gutter: '' },
  }[line.type];

  return (
    <div className={`flex ${config.bg} hover:brightness-110 transition-all`}>
      <div className={`w-6 shrink-0 text-center text-[10px] text-muted-foreground/60 select-none ${config.gutter}`}>
        {config.prefix}
      </div>
      <pre className={`flex-1 px-2 ${config.text} whitespace-pre-wrap break-all`}>
        {line.content}
      </pre>
    </div>
  );
}

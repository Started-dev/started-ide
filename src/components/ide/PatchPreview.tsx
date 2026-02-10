import { useState } from 'react';
import { Check, X, Play, Copy, FileCode, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
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

  const toggleFile = (index: number) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
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

  return (
    <div className="rounded-md border border-border bg-card animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-ide-panel-header border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Patch Preview
          </span>
          <span className="text-[10px] text-muted-foreground">
            {patch.patches.length} file{patch.patches.length !== 1 ? 's' : ''}
          </span>
        </div>

        {patch.status === 'preview' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onApply}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-ide-success/15 text-ide-success rounded-sm hover:bg-ide-success/25 transition-colors font-medium"
            >
              <Check className="h-3 w-3" />
              Apply
            </button>
            {suggestedCommand && (
              <button
                onClick={() => onApplyAndRun(suggestedCommand)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary/15 text-primary rounded-sm hover:bg-primary/25 transition-colors font-medium"
              >
                <Play className="h-3 w-3" />
                Apply + Run
              </button>
            )}
            <button
              onClick={onCancel}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-ide-error/15 text-ide-error rounded-sm hover:bg-ide-error/25 transition-colors font-medium"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        )}

        {patch.status === 'applied' && (
          <span className="flex items-center gap-1 text-xs text-ide-success">
            <Check className="h-3 w-3" /> Applied
          </span>
        )}

        {patch.status === 'failed' && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-ide-error">
              <AlertTriangle className="h-3 w-3" /> Failed
            </span>
            <button
              onClick={onCopyPatch}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="h-3 w-3" />
              Copy Patch
            </button>
          </div>
        )}

        {patch.status === 'cancelled' && (
          <span className="text-xs text-muted-foreground">Cancelled</span>
        )}
      </div>

      {/* Error message */}
      {patch.error && (
        <div className="px-3 py-2 bg-ide-error/5 border-b border-ide-error/20 text-xs text-ide-error">
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
              {/* File header */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border cursor-pointer hover:bg-muted transition-colors"
                onClick={() => toggleFile(fileIdx)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
                <FileCode className="h-3 w-3 text-ide-info" />
                <span className="text-xs font-mono text-foreground">
                  {isNewFile ? p.newFile : p.newFile}
                </span>
                {isNewFile && (
                  <span className="text-[10px] px-1 py-0.5 bg-ide-success/15 text-ide-success rounded-sm">NEW</span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  <span className="text-ide-success">+{stats.adds}</span>
                  {' '}
                  <span className="text-ide-error">-{stats.removes}</span>
                </span>
              </div>

              {/* Hunk lines */}
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

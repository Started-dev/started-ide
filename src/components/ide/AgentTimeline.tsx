import { useState, useMemo } from 'react';
import { Brain, Play, Square, Clock, Zap, ChevronRight, ChevronDown, CheckCircle2, FileCode, Terminal, Loader2 } from 'lucide-react';
import { AgentRun, AgentStep } from '@/types/agent';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

interface AgentTimelineProps {
  agentRun: AgentRun | null;
  onStop: () => void;
  onPause: () => void;
  onOpenFile?: (path: string) => void;
  onNewRun?: () => void;
}

// ─── Group steps by iteration ───

interface IterationGroup {
  iteration: number;
  steps: AgentStep[];
}

function groupByIteration(steps: AgentStep[]): IterationGroup[] {
  const groups: IterationGroup[] = [];
  let currentIteration = -1;

  for (const step of steps) {
    const iter = step.iteration ?? 0;
    if (iter !== currentIteration) {
      groups.push({ iteration: iter, steps: [step] });
      currentIteration = iter;
    } else {
      groups[groups.length - 1].steps.push(step);
    }
  }
  return groups;
}

function getIterationLabel(steps: AgentStep[]): string {
  const thinkStep = steps.find(s => s.type === 'think');
  if (thinkStep?.detail) {
    const preview = thinkStep.detail.slice(0, 60);
    return preview.length < thinkStep.detail.length ? `${preview}...` : preview;
  }
  const firstLabel = steps[0]?.label;
  if (firstLabel) return firstLabel.slice(0, 60);
  return 'Processing...';
}

// ─── Iteration Section ───

function IterationSection({ group, isLatest, onOpenFile }: {
  group: IterationGroup;
  isLatest: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(isLatest);
  const label = getIterationLabel(group.steps);
  const hasRunning = group.steps.some(s => s.status === 'running');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-1.5 text-left hover:bg-muted/30 rounded-sm px-1 transition-colors group">
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground">
          Iteration {group.iteration}:
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1">
          {label}
        </span>
        {hasRunning && (
          <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pl-5 space-y-0.5 pb-1">
          {group.steps.map((step) => (
            <StepLine key={step.id} step={step} onOpenFile={onOpenFile} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Individual Step Line ───

function StepLine({ step, onOpenFile }: { step: AgentStep; onOpenFile?: (path: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (step.type === 'think') {
    return (
      <div className="py-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-left w-full hover:opacity-80 transition-opacity"
        >
          <span className="text-[11px] font-semibold text-primary">Thinking:</span>
          <span className="text-[11px] text-muted-foreground truncate flex-1">
            {step.detail?.slice(0, 80) || step.label}
          </span>
        </button>
        {expanded && step.detail && (
          <pre className="text-[10px] text-muted-foreground/80 mt-1 ml-0.5 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-auto">
            {step.detail}
          </pre>
        )}
      </div>
    );
  }

  if (step.type === 'run') {
    return (
      <div className="py-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-left w-full hover:opacity-80 transition-opacity"
        >
          <Terminal className="h-2.5 w-2.5 text-ide-success shrink-0" />
          <span className="text-[11px] font-semibold text-ide-success">Running:</span>
          <span className="text-[11px] text-muted-foreground font-mono truncate flex-1">
            {step.detail || step.label}
          </span>
          {step.status === 'running' && <Loader2 className="h-2.5 w-2.5 text-primary animate-spin shrink-0" />}
        </button>
        {expanded && step.detail && (
          <pre className="text-[10px] text-muted-foreground/70 mt-1 ml-4 whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-auto bg-muted/30 rounded p-1.5">
            {step.detail}
          </pre>
        )}
      </div>
    );
  }

  if (step.type === 'patch') {
    return (
      <div className="py-0.5">
        <div className="flex items-center gap-1">
          <FileCode className="h-2.5 w-2.5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold text-primary">Patch:</span>
          <span className="text-[11px] text-muted-foreground truncate">
            {step.label}
          </span>
        </div>
        {step.filesChanged && step.filesChanged.length > 0 && (
          <div className="ml-4 mt-0.5 space-y-0">
            {step.filesChanged.map((fc) => (
              <button
                key={fc.path}
                onClick={() => onOpenFile?.(fc.path)}
                className="block text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {fc.action === 'created' ? '+' : '~'} {fc.path}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step.type === 'evaluate') {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <Zap className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] text-muted-foreground">{step.label}</span>
      </div>
    );
  }

  if (step.type === 'error') {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <span className="text-[11px] text-ide-error">✕ {step.label}</span>
        {step.detail && <span className="text-[10px] text-muted-foreground truncate">{step.detail}</span>}
      </div>
    );
  }

  // tool_call, mcp_call, or fallback
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="text-[11px] text-muted-foreground">
        {step.label}
      </span>
      {step.status === 'running' && <Loader2 className="h-2.5 w-2.5 text-primary animate-spin shrink-0" />}
    </div>
  );
}

// ─── Main Component ───

export function AgentTimeline({ agentRun, onStop, onPause, onOpenFile, onNewRun }: AgentTimelineProps) {
  const iterationGroups = useMemo(
    () => agentRun ? groupByIteration(agentRun.steps) : [],
    [agentRun?.steps]
  );

  if (!agentRun) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6">
        <div className="text-center space-y-3">
          <Brain className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p>No agent run active</p>
          <p className="text-xs text-muted-foreground/60">
            Start an autonomous run from the chat panel
          </p>
          {onNewRun && (
            <button
              onClick={onNewRun}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
            >
              <Play className="h-3 w-3" />
              New Agent Run
            </button>
          )}
        </div>
      </div>
    );
  }

  const isActive = agentRun.status === 'running' || agentRun.status === 'queued';
  const elapsed = agentRun.completedAt
    ? agentRun.completedAt.getTime() - agentRun.startedAt.getTime()
    : Date.now() - agentRun.startedAt.getTime();
  const doneStep = agentRun.steps.find(s => s.type === 'done');

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Brain className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider">Agent</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
            isActive ? 'bg-primary/15 text-primary' :
            agentRun.status === 'completed' ? 'bg-ide-success/15 text-ide-success' :
            agentRun.status === 'failed' ? 'bg-ide-error/15 text-ide-error' :
            'bg-muted text-muted-foreground'
          }`}>
            {agentRun.status}
          </span>
        </div>
        {isActive ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onPause}
              className="px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Pause
            </button>
            <button
              onClick={onStop}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-ide-error hover:bg-ide-error/10 rounded-sm transition-colors"
            >
              <Square className="h-2.5 w-2.5" />
              Stop
            </button>
          </div>
        ) : onNewRun ? (
          <button
            onClick={onNewRun}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/10 rounded-sm transition-colors"
          >
            <Play className="h-2.5 w-2.5" />
            New Run
          </button>
        ) : null}
      </div>

      {/* Goal & Meta */}
      <div className="px-3 py-2 border-b border-border space-y-1">
        <p className="text-xs text-foreground font-medium" title={agentRun.goal}>
          {agentRun.goal}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" />
            Iteration {agentRun.iteration}/{agentRun.maxIterations}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`}
          </span>
          <span>{agentRun.steps.length} steps</span>
        </div>
      </div>

      {/* Iteration Groups */}
      <div className="flex-1 overflow-auto px-2 py-2 space-y-0.5">
        {iterationGroups.map((group, idx) => (
          <IterationSection
            key={`iter-${group.iteration}-${idx}`}
            group={group}
            isLatest={idx === iterationGroups.length - 1}
            onOpenFile={onOpenFile}
          />
        ))}

        {/* Active indicator */}
        {isActive && (
          <div className="flex items-center gap-2 py-1.5 px-1">
            <Loader2 className="h-3 w-3 text-primary animate-spin" />
            <span className="text-xs text-muted-foreground italic">Working...</span>
          </div>
        )}

        {/* Goal completed summary */}
        {agentRun.status === 'completed' && (
          <div className="mt-2 px-1 py-2 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-ide-success" />
              <span className="text-xs font-medium text-ide-success">Goal completed</span>
            </div>
            {doneStep?.detail && (
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                {doneStep.detail}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

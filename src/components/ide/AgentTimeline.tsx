import { 
  Brain, Wrench, FileCode, Play, CheckCircle, XCircle, 
  Loader2, SkipForward, Square, Clock, Zap, AlertTriangle,
  FilePlus2, FileEdit, Eye, FlaskConical, Pencil, Link
} from 'lucide-react';
import { AgentRun, AgentStep, AgentStepType } from '@/types/agent';
import { getWeb3OpType, type Web3OpType } from '@/lib/tool-executor';

interface AgentTimelineProps {
  agentRun: AgentRun | null;
  onStop: () => void;
  onPause: () => void;
  onOpenFile?: (path: string) => void;
}

const stepIcon: Record<AgentStepType, React.ReactNode> = {
  think: <Brain className="h-3.5 w-3.5" />,
  tool_call: <Wrench className="h-3.5 w-3.5" />,
  patch: <FileCode className="h-3.5 w-3.5" />,
  run: <Play className="h-3.5 w-3.5" />,
  evaluate: <Zap className="h-3.5 w-3.5" />,
  done: <CheckCircle className="h-3.5 w-3.5" />,
  error: <AlertTriangle className="h-3.5 w-3.5" />,
};

const statusColors: Record<AgentStep['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-ide-warning',
  completed: 'text-ide-success',
  failed: 'text-ide-error',
  skipped: 'text-muted-foreground/50',
};

// ─── Web3 Operation Type Badge ───

const web3OpConfig: Record<Web3OpType, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  READ: {
    label: 'READ',
    icon: <Eye className="h-2.5 w-2.5" />,
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
  },
  SIMULATE: {
    label: 'SIM',
    icon: <FlaskConical className="h-2.5 w-2.5" />,
    bg: 'bg-sky-500/15',
    text: 'text-sky-400',
  },
  WRITE: {
    label: 'WRITE',
    icon: <Pencil className="h-2.5 w-2.5" />,
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
  },
};

function Web3OpBadge({ toolName }: { toolName: string }) {
  const opType = getWeb3OpType(toolName);
  if (!opType) return null;
  const cfg = web3OpConfig[opType];
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function isWeb3MCP(detail?: string): boolean {
  if (!detail) return false;
  return /^(evm_|contract_|solana_|sim_|wallet_)/.test(detail);
}

export function AgentTimeline({ agentRun, onStop, onPause, onOpenFile }: AgentTimelineProps) {
  if (!agentRun) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm p-6">
        <div className="text-center space-y-2">
          <Brain className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p>No agent run active</p>
          <p className="text-xs text-muted-foreground/60">
            Start an autonomous run from the chat panel
          </p>
        </div>
      </div>
    );
  }

  const isActive = agentRun.status === 'running' || agentRun.status === 'queued';
  const elapsed = agentRun.completedAt
    ? agentRun.completedAt.getTime() - agentRun.startedAt.getTime()
    : Date.now() - agentRun.startedAt.getTime();

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Brain className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider truncate">Agent</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${
            isActive ? 'bg-ide-warning/15 text-ide-warning animate-pulse' :
            agentRun.status === 'completed' ? 'bg-ide-success/15 text-ide-success' :
            agentRun.status === 'failed' ? 'bg-ide-error/15 text-ide-error' :
            'bg-muted text-muted-foreground'
          }`}>
            {agentRun.status}
          </span>
        </div>
        {isActive && (
          <div className="flex items-center gap-1">
            <button
              onClick={onPause}
              className="px-2 py-0.5 text-[10px] bg-ide-warning/10 text-ide-warning rounded-sm hover:bg-ide-warning/20 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={onStop}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-ide-error/10 text-ide-error rounded-sm hover:bg-ide-error/20 transition-colors"
            >
              <Square className="h-2.5 w-2.5" />
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Goal & Meta */}
      <div className="px-3 py-2 border-b border-border space-y-1">
        <p className="text-xs text-foreground font-medium truncate" title={agentRun.goal}>
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

      {/* Timeline */}
      <div className="flex-1 overflow-auto px-3 py-2">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-1">
            {agentRun.steps.map((step) => (
              <div key={step.id} className="relative flex items-start gap-2.5 py-1">
                {/* Dot */}
                <div className={`relative z-10 flex items-center justify-center w-4 h-4 rounded-full shrink-0 ${
                  step.status === 'running' ? 'bg-ide-warning/20' :
                  step.status === 'completed' ? 'bg-ide-success/20' :
                  step.status === 'failed' ? 'bg-ide-error/20' :
                  'bg-muted'
                }`}>
                  {step.status === 'running' ? (
                    <Loader2 className="h-2.5 w-2.5 text-ide-warning animate-spin" />
                  ) : (
                    <span className={statusColors[step.status]}>
                      {stepIcon[step.type]}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${statusColors[step.status]}`}>
                      {step.label}
                    </span>
                    {/* Web3 op-type badge */}
                    {step.type === 'tool_call' && step.detail && isWeb3MCP(step.detail) && (
                      <Web3OpBadge toolName={step.detail.split('(')[0].trim()} />
                    )}
                    {/* Web3 chain indicator */}
                    {step.type === 'tool_call' && step.detail && isWeb3MCP(step.detail) && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
                        <Link className="h-2 w-2" />
                        Web3
                      </span>
                    )}
                    {step.durationMs !== undefined && (
                      <span className="text-[10px] text-muted-foreground">
                        {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                      {step.detail}
                    </p>
                  )}

                  {/* File changes indicator */}
                  {step.filesChanged && step.filesChanged.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {step.filesChanged.map((fc) => (
                        <button
                          key={fc.path}
                          onClick={() => onOpenFile?.(fc.path)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono cursor-pointer hover:opacity-80 transition-opacity ${
                            fc.action === 'created'
                              ? 'bg-ide-success/10 text-ide-success'
                              : 'bg-ide-info/10 text-ide-info'
                          }`}
                          title={`Click to open · ${fc.action}: ${fc.path}`}
                        >
                          {fc.action === 'created' ? (
                            <FilePlus2 className="h-2.5 w-2.5" />
                          ) : (
                            <FileEdit className="h-2.5 w-2.5" />
                          )}
                          {fc.path.split('/').pop()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Running indicator */}
            {isActive && (
              <div className="relative flex items-center gap-2.5 py-1">
                <div className="relative z-10 w-4 h-4 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-ide-warning animate-pulse" />
                </div>
                <span className="text-xs text-muted-foreground italic">Working...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

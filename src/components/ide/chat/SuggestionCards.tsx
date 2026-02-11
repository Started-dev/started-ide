import { useMemo } from 'react';
import { useIDE } from '@/contexts/IDEContext';
import { generateCandidates, selectActions, type NBASignals } from '@/lib/policies/nba';
import defaultPolicy from '@/lib/policies/nba.policy.json';
import type { NBAPolicy } from '@/lib/policies/nba';

interface SuggestionCardsProps {
  inputLength: number;
  onSendMessage: (msg: string) => void;
}

export function SuggestionCards({ inputLength, onSendMessage }: SuggestionCardsProps) {
  const { runs, pendingPatches, agentRun } = useIDE();

  const suggestions = useMemo(() => {
    if (inputLength > 0) return [];

    const lastRun = runs[runs.length - 1];
    const signals: NBASignals = {
      hasPatch: pendingPatches.some(p => p.status === 'preview'),
      diffDirty: pendingPatches.length > 0,
      lastRunFailed: lastRun?.status === 'error',
      lastRunOk: lastRun?.status === 'success',
      hasSuggestedCommands: false,
      testsKnown: false,
      testsExist: false,
      agentRunning: agentRun?.status === 'running',
      agentBlocked: agentRun?.status === 'failed',
      needsApproval: false,
      riskLevel: 'read',
      userIgnoredCount: {},
      timeSinceLastProgressSec: 0,
    };

    const fsmState = signals.lastRunFailed ? 'EVALUATING_RESULTS'
      : signals.hasPatch ? 'PATCH_READY'
      : signals.agentRunning ? 'AGENT_RUNNING'
      : 'IDLE';

    const candidates = generateCandidates(fsmState, signals);
    const { primary, secondary } = selectActions(candidates, signals, defaultPolicy as NBAPolicy);

    const actions = [primary, ...secondary].filter(Boolean).slice(0, 3);
    return actions.map(a => ({ label: a!.label, key: a!.key }));
  }, [inputLength, runs, pendingPatches, agentRun]);

  if (suggestions.length === 0) return null;

  return (
    <div className="flex gap-1.5 px-3 py-1.5 animate-fade-in">
      {suggestions.map(s => (
        <button
          key={s.key}
          onClick={() => onSendMessage(s.label)}
          className="px-3 py-1.5 text-[11px] text-muted-foreground rounded-md border border-border/40 bg-muted/30 hover:bg-muted/50 hover:text-foreground hover:border-border/60 transition-all duration-150"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

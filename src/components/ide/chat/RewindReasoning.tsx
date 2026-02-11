import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCcw } from 'lucide-react';

interface RewindReasoningProps {
  reasoning?: {
    signals: string[];
    state: string;
    action: string;
    reason: string;
  };
}

export function RewindReasoning({ reasoning }: RewindReasoningProps) {
  if (!reasoning) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-150 mt-1">
        <RotateCcw className="h-2.5 w-2.5" />
        Rewind Reasoning
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 p-2 rounded-md border border-border/30 bg-[hsl(var(--chat-block-bg))] text-[10px] space-y-1.5 animate-fade-in">
        <div>
          <span className="text-muted-foreground/70">Signals: </span>
          <span className="text-muted-foreground">{reasoning.signals.join(', ')}</span>
        </div>
        <div>
          <span className="text-muted-foreground/70">State: </span>
          <span className="text-muted-foreground font-mono">{reasoning.state}</span>
        </div>
        <div>
          <span className="text-muted-foreground/70">Action: </span>
          <span className="text-primary font-mono">{reasoning.action}</span>
        </div>
        <div>
          <span className="text-muted-foreground/70">Why: </span>
          <span className="text-foreground/70">{reasoning.reason}</span>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

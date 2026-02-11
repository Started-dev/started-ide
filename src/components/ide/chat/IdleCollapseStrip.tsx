import { SystemPulse } from './SystemPulse';
import { MessageSquare } from 'lucide-react';
import type { ChatMessage } from '@/types/ide';

interface IdleCollapseStripProps {
  pulseState: 'idle' | 'processing' | 'agent' | 'error';
  lastMessage?: ChatMessage;
  onClick: () => void;
}

export function IdleCollapseStrip({ pulseState, lastMessage, onClick }: IdleCollapseStripProps) {
  return (
    <div
      onClick={onClick}
      className="w-10 h-full flex flex-col items-center py-3 gap-3 bg-card border-l border-border cursor-pointer hover:w-48 hover:items-start hover:px-3 transition-all duration-300 ease-in-out overflow-hidden group"
    >
      <SystemPulse state={pulseState} />
      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {lastMessage && (
        <p className="text-[10px] text-muted-foreground/70 leading-tight opacity-0 group-hover:opacity-100 transition-opacity duration-200 line-clamp-3 w-0 group-hover:w-full">
          {lastMessage.content.slice(0, 120)}…
        </p>
      )}
    </div>
  );
}

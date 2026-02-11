import { Plus, X, MessageSquare } from 'lucide-react';
import { SystemPulse } from './SystemPulse';
import startedLogo from '@/assets/started-logo.png';
import type { Conversation } from '@/types/ide';
import type { ToolCall } from '@/types/tools';
import { useRef, useEffect } from 'react';

type PulseState = 'idle' | 'processing' | 'agent' | 'error';

interface ChatHeaderProps {
  pulseState: PulseState;
  pendingToolCount: number;
  isAgentActive: boolean;
  conversations: Conversation[];
  activeConversationId: string;
  onSwitchConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

export function ChatHeader({
  pulseState,
  pendingToolCount,
  isAgentActive,
  conversations,
  activeConversationId,
  onSwitchConversation,
  onNewConversation,
  onDeleteConversation,
}: ChatHeaderProps) {
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeConversationId]);

  return (
    <>
      {/* Header bar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-border ${isAgentActive ? 'border-t-2 border-t-primary' : ''}`}>
        <img src={startedLogo} alt="Started" className="h-4 w-4 rounded-full" />
        <span className="text-xs font-semibold uppercase tracking-wider">Started</span>
        <div className="flex-1" />
        {pendingToolCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-ide-warning/15 text-ide-warning rounded-sm animate-pulse">
            {pendingToolCount} pending
          </span>
        )}
        <SystemPulse state={pulseState} />
      </div>

      {/* Conversation tabs */}
      <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto">
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {conversations.length > 0 ? (
            conversations.map(conv => (
              <div
                key={conv.id}
                ref={conv.id === activeConversationId ? activeTabRef : undefined}
                className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer border-r border-border/50 shrink-0 max-w-[140px] transition-colors duration-150 ${
                  activeConversationId === conv.id
                    ? 'bg-card text-foreground border-b-2 border-b-primary'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
                onClick={() => onSwitchConversation(conv.id)}
                title={conv.title}
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                <span className="truncate">{conv.title}</span>
                {conversations.length > 1 && (
                  <button
                    className="ml-auto p-0.5 rounded-sm hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0"
                    onClick={e => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] bg-card text-foreground border-b-2 border-b-primary border-r border-border/50 shrink-0">
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="truncate">New Chat</span>
            </div>
          )}
        </div>
        <button
          onClick={onNewConversation}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors duration-150 shrink-0"
          title="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}

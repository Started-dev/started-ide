import { useState, useRef, useEffect } from 'react';
import { Send, AtSign, FileCode, AlertCircle, Brain, Plus, X, MessageSquare } from 'lucide-react';
import startedLogo from '@/assets/started-logo.png';
import { useIDE } from '@/contexts/IDEContext';
import { ContextChip } from '@/types/ide';
import { PermissionPrompt } from './PermissionPrompt';
import { PatchPreviewPanel } from './PatchPreview';
import { ToolCallDisplay } from './ToolCallDisplay';
import { extractCommandsFromMessage } from '@/lib/patch-utils';

export function ChatPanel() {
  const {
    chatMessages, sendMessage, selectedText, activeTabId, getFileById, runs,
    toolCalls, pendingPatches, approveToolCall, denyToolCall, alwaysAllowTool, alwaysAllowCommand,
    applyPatch, applyPatchAndRun, cancelPatch,
    startAgent, setActiveRightPanel,
    conversations, activeConversationId, switchConversation, newConversation, deleteConversation,
  } = useIDE();
  const [input, setInput] = useState('');
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, toolCalls, pendingPatches]);

  const addChip = (type: ContextChip['type']) => {
    if (type === 'selection' && selectedText) {
      setChips(prev => [...prev.filter(c => c.type !== 'selection'), { type: 'selection', label: 'Selection', content: selectedText }]);
    } else if (type === 'file' && activeTabId) {
      const file = getFileById(activeTabId);
      if (file) {
        setChips(prev => [...prev.filter(c => !(c.type === 'file' && c.label === file.name)), { type: 'file', label: file.name, content: file.content }]);
      }
    } else if (type === 'errors') {
      const lastRun = runs[runs.length - 1];
      if (lastRun) {
        setChips(prev => [...prev.filter(c => c.type !== 'errors'), { type: 'errors', label: 'Last Run Errors', content: lastRun.logs }]);
      }
    }
  };

  const removeChip = (index: number) => setChips(prev => prev.filter((_, i) => i !== index));

  const handleSend = () => {
    if (!input.trim() && chips.length === 0) return;
    if (agentMode) {
      startAgent(input.trim());
      setActiveRightPanel('agent');
    } else {
      sendMessage(input, chips.length > 0 ? chips : undefined);
    }
    setInput('');
    setChips([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const chipIcon = (type: string) => {
    switch (type) {
      case 'selection': return <AtSign className="h-3 w-3" />;
      case 'file': return <FileCode className="h-3 w-3" />;
      case 'errors': return <AlertCircle className="h-3 w-3" />;
      default: return null;
    }
  };

  const pendingTools = toolCalls.filter(tc => tc.status === 'pending');
  const recentTools = toolCalls.filter(tc => tc.status !== 'pending').slice(-6);

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <img src={startedLogo} alt="Started" className="h-4 w-4 rounded-full" />
        <span className="text-xs font-semibold uppercase tracking-wider">Started</span>
        {pendingTools.length > 0 && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-ide-warning/15 text-ide-warning rounded-sm animate-pulse">
            {pendingTools.length} pending
          </span>
        )}
      </div>

      {/* Conversation History Tabs */}
      <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto">
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {conversations.length > 0 ? (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer border-r border-border/50 shrink-0 max-w-[140px] transition-colors ${
                  activeConversationId === conv.id
                    ? 'bg-card text-foreground border-b-2 border-b-primary'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
                onClick={() => switchConversation(conv.id)}
                title={conv.title}
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                <span className="truncate">{conv.title}</span>
                {conversations.length > 1 && (
                  <button
                    className="ml-auto p-0.5 rounded-sm hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
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
          onClick={newConversation}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
          title="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
        {chatMessages.map(msg => (
          <ChatMessage key={msg.id} msg={msg} chipIcon={chipIcon} />
        ))}

        {recentTools.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tool Activity</div>
            {recentTools.map(tc => <ToolCallDisplay key={tc.id} toolCall={tc} />)}
          </div>
        )}

        {pendingTools.map(tc => (
          <PermissionPrompt
            key={tc.id} toolCall={tc}
            onApprove={() => approveToolCall(tc.id)}
            onDeny={() => denyToolCall(tc.id)}
            onAlwaysAllow={() => {
              if (tc.tool === 'run_command') alwaysAllowCommand((tc.input as { command: string }).command);
              else alwaysAllowTool(tc.tool);
              approveToolCall(tc.id);
            }}
          />
        ))}

        {pendingPatches.filter(p => p.status === 'preview').map(patch => {
          const lastAssistantMsg = [...chatMessages].reverse().find(m => m.role === 'assistant');
          const commands = lastAssistantMsg ? extractCommandsFromMessage(lastAssistantMsg.content) : [];
          return (
            <PatchPreviewPanel
              key={patch.id} patch={patch}
              onApply={() => applyPatch(patch.id)}
              onApplyAndRun={(cmd) => applyPatchAndRun(patch.id, cmd)}
              onCancel={() => cancelPatch(patch.id)}
              onCopyPatch={() => navigator.clipboard.writeText(patch.raw)}
              suggestedCommand={commands[0]}
            />
          );
        })}

        {pendingPatches.filter(p => p.status !== 'preview').slice(-3).map(patch => (
          <PatchPreviewPanel
            key={patch.id} patch={patch}
            onApply={() => {}} onApplyAndRun={() => {}} onCancel={() => {}}
            onCopyPatch={() => navigator.clipboard.writeText(patch.raw)}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Context chips */}
      {chips.length > 0 && (
        <div className="px-3 pb-1 flex flex-wrap gap-1">
          {chips.map((chip, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/15 text-primary text-[11px] rounded-sm cursor-pointer hover:bg-primary/25" onClick={() => removeChip(i)}>
              {chipIcon(chip.type)}
              {chip.label}
              <CloseIcon className="h-2.5 w-2.5" />
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex gap-1">
          <button onClick={() => addChip('selection')} className={`text-[10px] px-2 py-1 rounded-sm transition-colors ${selectedText ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground'}`} disabled={!selectedText}>@selection</button>
          <button onClick={() => addChip('file')} className={`text-[10px] px-2 py-1 rounded-sm transition-colors ${activeTabId ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground'}`} disabled={!activeTabId}>@file</button>
          <button onClick={() => addChip('errors')} className={`text-[10px] px-2 py-1 rounded-sm transition-colors ${runs.length > 0 ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground'}`} disabled={runs.length === 0}>@errors</button>
          <div className="flex-1" />
          <button
            onClick={() => setAgentMode(prev => !prev)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-sm transition-colors ${
              agentMode ? 'bg-ide-warning/15 text-ide-warning' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <Brain className="h-3 w-3" />
            {agentMode ? 'Agent ON' : 'Agent'}
          </button>
        </div>
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={agentMode ? 'Describe a goal for the agent...' : 'Ask Started...'}
            className="flex-1 bg-input text-foreground text-sm px-3 py-2 rounded-md border border-border resize-none outline-none focus:border-primary transition-colors min-h-[36px] max-h-[120px] font-sans"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() && chips.length === 0}
            className={`p-2 rounded-md transition-all shrink-0 disabled:opacity-30 ${
              agentMode
                ? 'bg-ide-warning text-background hover:bg-ide-warning/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {agentMode ? <Brain className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function ChatMessage({ msg, chipIcon }: { msg: import('@/types/ide').ChatMessage; chipIcon: (type: string) => React.ReactNode }) {
  return (
    <div className={`animate-fade-in ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
      {msg.contextChips && msg.contextChips.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {msg.contextChips.map((chip, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] rounded-sm">
              {chipIcon(chip.type)}
              {chip.label}
            </span>
          ))}
        </div>
      )}
      <div className={`text-sm leading-relaxed ${
        msg.role === 'user'
          ? 'bg-primary/10 text-foreground rounded-lg px-3 py-2 max-w-[85%]'
          : 'text-foreground'
      }`}>
        <div className="whitespace-pre-wrap font-mono text-xs">
          {msg.content.split(/(`{3}[\s\S]*?`{3})/g).map((part, i) => {
            if (part.startsWith('```') && part.endsWith('```')) {
              const lines = part.split('\n');
              const lang = lines[0].replace('```', '');
              const code = lines.slice(1, -1).join('\n');
              const isDiff = lang === 'diff';
              return (
                <pre key={i} className="my-2 p-3 bg-muted rounded-md overflow-x-auto text-[11px]">
                  {lang && <div className="text-[10px] text-muted-foreground mb-1">{lang}</div>}
                  <code>
                    {isDiff ? (
                      code.split('\n').map((line, li) => (
                        <div key={li} className={
                          line.startsWith('+') ? 'text-ide-success' :
                          line.startsWith('-') ? 'text-ide-error' :
                          line.startsWith('@@') ? 'text-ide-info' : ''
                        }>{line}</div>
                      ))
                    ) : code}
                  </code>
                </pre>
              );
            }
            return <span key={i}>{part.split(/(\*\*.*?\*\*)/g).map((seg, j) => {
              if (seg.startsWith('**') && seg.endsWith('**')) {
                return <strong key={j} className="text-foreground font-semibold">{seg.slice(2, -2)}</strong>;
              }
              return seg;
            })}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

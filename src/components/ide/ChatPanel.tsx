import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, AtSign, FileCode, AlertCircle, Brain, X, Globe, Image, Link, Paperclip, Sparkles, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useIDE } from '@/contexts/IDEContext';
import { ContextChip } from '@/types/ide';
import { PermissionPrompt } from './PermissionPrompt';
import { PatchPreviewPanel } from './PatchPreview';
import { ToolCallDisplay } from './ToolCallDisplay';
import { ModelSelector } from './ModelSelector';
import { extractCommandsFromMessage } from '@/lib/patch-utils';
import { ChatHeader } from './chat/ChatHeader';
import { AssistantMessage } from './chat/AssistantMessage';
import { ActionCard } from './chat/ActionCard';
import { ResultCard } from './chat/ResultCard';
import { SuggestionCard } from './chat/SuggestionCardMessage';
import { ContextStrip } from './chat/ContextStrip';
import { SuggestionCards } from './chat/SuggestionCards';
import { HesitationPrompt } from './chat/HesitationPrompt';
import { useHesitationDetection } from '@/hooks/use-hesitation-detection';
import { SKILLS_CATALOG } from '@/data/skills-catalog';

export function ChatPanel() {
  const {
    chatMessages, sendMessage, selectedText, activeTabId, getFileById, runs,
    toolCalls, pendingPatches, approveToolCall, denyToolCall, alwaysAllowTool, alwaysAllowCommand,
    applyPatch, applyPatchAndRun, cancelPatch,
    startAgent, setActiveRightPanel, agentRun, runCommand,
    conversations, activeConversationId, switchConversation, newConversation, deleteConversation,
    selectedModel, setSelectedModel,
    activeSkills,
  } = useIDE();
  const [input, setInput] = useState('');
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [chipDialog, setChipDialog] = useState<{ type: 'url' | 'web'; value: string } | null>(null);

  // Determine pulse state
  const isStreaming = chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'assistant';
  const isAgentActive = agentRun?.status === 'running' || agentRun?.status === 'queued';
  const lastRunFailed = runs.length > 0 && runs[runs.length - 1].status === 'error';
  const pulseState = lastRunFailed ? 'error' as const
    : isAgentActive ? 'agent' as const
    : isStreaming ? 'processing' as const
    : 'idle' as const;

  // Hesitation detection
  const hesitation = useHesitationDetection(
    lastRunFailed,
    pendingPatches.length > 0,
    pendingPatches.length,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, toolCalls, pendingPatches]);

  const addChip = (type: ContextChip['type']) => {
    hesitation.recordActivity();
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
    } else if (type === 'url') {
      setChipDialog({ type: 'url', value: '' });
    } else if (type === 'web') {
      setChipDialog({ type: 'web', value: '' });
    } else if (type === 'image') {
      imageInputRef.current?.click();
    } else if (type === 'attachment') {
      attachInputRef.current?.click();
    }
  };

  const confirmChipDialog = () => {
    if (!chipDialog || !chipDialog.value.trim()) return;
    if (chipDialog.type === 'url') {
      setChips(prev => [...prev, { type: 'url', label: chipDialog.value.slice(0, 30), content: `[Fetch URL: ${chipDialog.value}]` }]);
    } else {
      setChips(prev => [...prev, { type: 'web', label: chipDialog.value.slice(0, 30), content: `[Web Search: ${chipDialog.value}]` }]);
    }
    setChipDialog(null);
  };

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setChips(prev => [...prev, { type: 'image', label: file.name.slice(0, 20), content: base64 }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleAttachmentUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const TEXT_EXTENSIONS = new Set([
      'txt','md','markdown','json','js','jsx','ts','tsx','py','rb','go',
      'rs','java','c','cpp','h','hpp','cs','swift','kt','scala','sh',
      'bash','zsh','fish','ps1','bat','cmd','html','htm','css','scss',
      'sass','less','xml','svg','yaml','yml','toml','ini','cfg','conf',
      'env','log','sql','graphql','gql','proto','csv','tsv','rst',
      'tex','r','lua','php','pl','pm','ex','exs','erl','hs','ml',
      'vim','dockerfile','makefile','gitignore',
    ]);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isText = TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/');

    if (isText) {
      const reader = new FileReader();
      reader.onload = () => {
        let text = reader.result as string;
        if (text.length > 50_000) {
          text = text.slice(0, 50_000) + '\n\n[...truncated at 50 000 chars]';
        }
        setChips(prev => [...prev, { type: 'attachment', label: file.name.slice(0, 24), content: text }]);
      };
      reader.readAsText(file);
    } else {
      const sizeKB = Math.round(file.size / 1024);
      setChips(prev => [...prev, { type: 'attachment', label: file.name.slice(0, 24), content: `[Binary file: ${file.name} (${sizeKB} KB)]` }]);
    }
    e.target.value = '';
  }, []);

  const removeChip = (index: number) => setChips(prev => prev.filter((_, i) => i !== index));

  const handleSend = (content?: string) => {
    const msg = content || input;
    if (!msg.trim() && chips.length === 0) return;
    hesitation.recordActivity();

    // Build skill context chips from active skills
    const skillChips: ContextChip[] = activeSkills
      .map(id => SKILLS_CATALOG.find(s => s.id === id))
      .filter(Boolean)
      .map(skill => ({
        type: 'attachment' as const,
        label: `Skill: ${skill!.name}`,
        content: skill!.systemPrompt,
      }));

    // Build dedicated skill context string for system-level injection
    const skillContextStr = activeSkills
      .map(id => SKILLS_CATALOG.find(s => s.id === id))
      .filter(Boolean)
      .map(s => `[Skill: ${s!.name}]\n${s!.systemPrompt}`)
      .join('\n\n');

    const allChips = [...chips, ...skillChips];

    if (agentMode) {
      startAgent(msg.trim());
      setActiveRightPanel('agent');
    } else {
      sendMessage(msg, allChips.length > 0 ? allChips : undefined);
    }
    setInput('');
    setChips([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    hesitation.recordActivity();
  };

  const chipIcon = (type: string) => {
    switch (type) {
      case 'selection': return <AtSign className="h-3 w-3" />;
      case 'file': return <FileCode className="h-3 w-3" />;
      case 'errors': return <AlertCircle className="h-3 w-3" />;
      case 'url': return <Link className="h-3 w-3" />;
      case 'web': return <Globe className="h-3 w-3" />;
      case 'image': return <Image className="h-3 w-3" />;
      case 'attachment': return <Paperclip className="h-3 w-3" />;
      default: return null;
    }
  };

  const pendingTools = toolCalls.filter(tc => tc.status === 'pending');
  const recentTools = toolCalls.filter(tc => tc.status !== 'pending').slice(-6);

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--chat-surface))]">
      <ChatHeader
        pulseState={pulseState}
        pendingToolCount={pendingTools.length}
        isAgentActive={isAgentActive}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSwitchConversation={switchConversation}
        onNewConversation={newConversation}
        onDeleteConversation={deleteConversation}
      />

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
        {chatMessages.map(msg => {
          // Structured card types
          if (msg.cardType === 'action') {
            return <ActionCard key={msg.id} msg={msg} />;
          }
          if (msg.cardType === 'result') {
            return (
              <ResultCard
                key={msg.id}
                msg={msg}
                onRetry={msg.resultData?.runnerUnavailable ? undefined : () => {
                  // Find the original command from nearby action cards
                  const actionMsg = chatMessages.find(m => m.cardType === 'action' && m.actionData);
                  if (actionMsg?.actionData) runCommand(actionMsg.actionData.command);
                }}
                onSendToChat={() => {
                  if (msg.resultData?.logs) {
                    sendMessage(`The last command failed with exit code ${msg.resultData.exitCode}. Here's the output:\n\`\`\`\n${msg.resultData.logs.slice(0, 2000)}\n\`\`\`\nPlease help me fix this.`);
                  }
                }}
              />
            );
          }
          if (msg.cardType === 'suggestion') {
            return (
              <SuggestionCard
                key={msg.id}
                msg={msg}
                onAction={(action) => {
                  if (action === 'connect_runner') {
                    setActiveRightPanel('protocol');
                  } else if (action === 'view_docs') {
                    window.open('https://docs.started.dev/runners', '_blank');
                  } else {
                    sendMessage(action);
                  }
                }}
              />
            );
          }
          // Standard messages
          return msg.role === 'assistant' ? (
            <AssistantMessage key={msg.id} msg={msg} />
          ) : (
            <UserMessage key={msg.id} msg={msg} chipIcon={chipIcon} />
          );
        })}

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

      {/* Hesitation prompt */}
      {hesitation.show && (
        <HesitationPrompt
          message={hesitation.message}
          onAccept={() => { hesitation.dismiss(); handleSend(hesitation.message); }}
          onDismiss={hesitation.dismiss}
        />
      )}

      {/* Suggestion cards — inside the input border area */}

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input ref={attachInputRef} type="file" className="hidden" onChange={handleAttachmentUpload} />

      {/* Input area */}
      <div className="border-t border-border px-3 pt-2 pb-2 space-y-1.5">
        {/* Suggestion cards inside input area */}
        <SuggestionCards inputLength={input.length} onSendMessage={(msg) => handleSend(msg)} />
        {/* Attached context chips + active skills — only when present */}
        {(chips.length > 0 || activeSkills.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {chips.map((chip, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/15 text-primary text-[10px] rounded-full cursor-pointer hover:bg-primary/25 transition-colors duration-150" onClick={() => removeChip(i)}>
                {chipIcon(chip.type)}
                {chip.label}
                <X className="h-2.5 w-2.5" />
              </span>
            ))}
            {activeSkills.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/15 text-primary text-[10px] rounded-full">
                <Sparkles className="h-2.5 w-2.5" />
                {activeSkills.length} skill{activeSkills.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Main input row */}
        <div className="flex gap-1.5 items-end">
          {/* + context menu */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 shrink-0 self-center">
                <Plus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={6} className="w-40 p-1">
              <button onClick={() => addChip('selection')} disabled={!selectedText} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                <AtSign className="h-3 w-3" /> Selection
              </button>
              <button onClick={() => addChip('file')} disabled={!activeTabId} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                <FileCode className="h-3 w-3" /> File
              </button>
              <button onClick={() => addChip('errors')} disabled={runs.length === 0} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                <AlertCircle className="h-3 w-3" /> Errors
              </button>
              <div className="h-px bg-border my-0.5" />
              <button onClick={() => addChip('url')} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors flex items-center gap-2">
                <Link className="h-3 w-3" /> URL
              </button>
              <button onClick={() => addChip('web')} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors flex items-center gap-2">
                <Globe className="h-3 w-3" /> Web Search
              </button>
              <button onClick={() => addChip('image')} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors flex items-center gap-2">
                <Image className="h-3 w-3" /> Image
              </button>
              <button onClick={() => addChip('attachment')} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded-sm hover:bg-accent transition-colors flex items-center gap-2">
                <Paperclip className="h-3 w-3" /> Attach File
              </button>
            </PopoverContent>
          </Popover>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); hesitation.recordActivity(); }}
            onKeyDown={handleKeyDown}
            placeholder={agentMode ? 'Describe a goal for the agent...' : 'Ask Started...'}
            className="flex-1 bg-input text-foreground text-sm px-3 py-2 rounded-md border border-border resize-none outline-none focus:border-primary transition-colors duration-150 min-h-[36px] max-h-[120px] font-sans"
            rows={1}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() && chips.length === 0}
            className={`p-2 rounded-md transition-all duration-150 shrink-0 disabled:opacity-30 ${
              agentMode
                ? 'bg-ide-warning text-background hover:bg-ide-warning/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {agentMode ? <Brain className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        {/* Footer: context strip + model selector + agent toggle */}
        <div className="flex items-center gap-1.5">
          <ContextStrip />
          <div className="flex-1" />
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />
          <button
            onClick={() => setAgentMode(prev => !prev)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 ${
              agentMode ? 'bg-ide-warning/15 text-ide-warning' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <Brain className="h-3 w-3" />
            {agentMode ? 'Agent ON' : 'Agent'}
          </button>
        </div>
      </div>

      {/* @url / @web dialog */}
      <Dialog open={!!chipDialog} onOpenChange={(v) => !v && setChipDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {chipDialog?.type === 'url' ? 'Fetch URL' : 'Web Search'}
            </DialogTitle>
            <DialogDescription>
              {chipDialog?.type === 'url'
                ? 'Enter a URL to fetch and include as context.'
                : 'Enter a search query to find relevant information.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              autoFocus
              placeholder={chipDialog?.type === 'url' ? 'https://example.com' : 'Search query...'}
              value={chipDialog?.value ?? ''}
              onChange={(e) => setChipDialog(prev => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmChipDialog(); }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setChipDialog(null)}>Cancel</Button>
              <Button size="sm" onClick={confirmChipDialog} disabled={!chipDialog?.value.trim()}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───

function UserMessage({ msg, chipIcon }: { msg: import('@/types/ide').ChatMessage; chipIcon: (type: string) => React.ReactNode }) {
  return (
    <div className="animate-fade-in flex justify-end">
      <div className="bg-primary/10 text-foreground rounded-lg px-3 py-2 max-w-[85%]">
        {msg.contextChips && msg.contextChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {msg.contextChips.map((chip, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/15 text-primary text-[10px] rounded-sm">
                {chipIcon(chip.type)}
                {chip.label}
              </span>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap font-mono text-xs">
          {msg.content}
        </div>
      </div>
    </div>
  );
}

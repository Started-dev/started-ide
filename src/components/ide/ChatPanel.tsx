import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, AtSign, FileCode, AlertCircle, Brain, X, Globe, Image, Link } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { ContextStrip } from './chat/ContextStrip';
import { SuggestionCards } from './chat/SuggestionCards';
import { HesitationPrompt } from './chat/HesitationPrompt';
import { useHesitationDetection } from '@/hooks/use-hesitation-detection';

export function ChatPanel() {
  const {
    chatMessages, sendMessage, selectedText, activeTabId, getFileById, runs,
    toolCalls, pendingPatches, approveToolCall, denyToolCall, alwaysAllowTool, alwaysAllowCommand,
    applyPatch, applyPatchAndRun, cancelPatch,
    startAgent, setActiveRightPanel, agentRun,
    conversations, activeConversationId, switchConversation, newConversation, deleteConversation,
    selectedModel, setSelectedModel,
  } = useIDE();
  const [input, setInput] = useState('');
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  const removeChip = (index: number) => setChips(prev => prev.filter((_, i) => i !== index));

  const handleSend = (content?: string) => {
    const msg = content || input;
    if (!msg.trim() && chips.length === 0) return;
    hesitation.recordActivity();
    if (agentMode) {
      startAgent(msg.trim());
      setActiveRightPanel('agent');
    } else {
      sendMessage(msg, chips.length > 0 ? chips : undefined);
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
        {chatMessages.map(msg => (
          msg.role === 'assistant' ? (
            <AssistantMessage key={msg.id} msg={msg} />
          ) : (
            <UserMessage key={msg.id} msg={msg} chipIcon={chipIcon} />
          )
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

      {/* Hesitation prompt */}
      {hesitation.show && (
        <HesitationPrompt
          message={hesitation.message}
          onAccept={() => { hesitation.dismiss(); handleSend(hesitation.message); }}
          onDismiss={hesitation.dismiss}
        />
      )}

      {/* Suggestion cards */}
      <SuggestionCards inputLength={input.length} onSendMessage={(msg) => handleSend(msg)} />

      {/* Context strip */}
      <ContextStrip />

      {/* Context chips */}
      {chips.length > 0 && (
        <div className="px-3 pb-1 flex flex-wrap gap-1">
          {chips.map((chip, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/15 text-primary text-[11px] rounded-sm cursor-pointer hover:bg-primary/25 transition-colors duration-150" onClick={() => removeChip(i)}>
              {chipIcon(chip.type)}
              {chip.label}
              <X className="h-2.5 w-2.5" />
            </span>
          ))}
        </div>
      )}

      {/* Hidden image input */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Input */}
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => addChip('selection')} className={`text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 ${selectedText ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground'}`} disabled={!selectedText}>@selection</button>
          <button onClick={() => addChip('file')} className={`text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 ${activeTabId ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground'}`} disabled={!activeTabId}>@file</button>
          <button onClick={() => addChip('errors')} className={`text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 ${runs.length > 0 ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground'}`} disabled={runs.length === 0}>@errors</button>
          <button onClick={() => addChip('url')} className="text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 bg-primary/10 text-primary hover:bg-primary/20">@url</button>
          <button onClick={() => addChip('web')} className="text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 bg-primary/10 text-primary hover:bg-primary/20">@web</button>
          <button onClick={() => addChip('image')} className="text-[10px] px-2 py-1 rounded-sm transition-colors duration-150 bg-primary/10 text-primary hover:bg-primary/20">@image</button>
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
        <div className="flex gap-2 items-end">
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
      <div className="bg-primary/10 text-foreground rounded-lg px-3 py-2 max-w-[85%]">
        <div className="whitespace-pre-wrap font-mono text-xs">
          {msg.content}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Play, Terminal, Square, CheckCircle, XCircle, Loader2, Clock, FolderOpen, Cpu, Send, Trash2, Plus, X, Globe, ChevronRight } from 'lucide-react';
import { useIDE } from '@/contexts/IDEContext';
import { BrowserPreview, detectServerUrl } from './BrowserPreview';
import { RUNTIME_TEMPLATES } from '@/types/runner';
import type { RuntimeType } from '@/types/runner';

interface TerminalTab {
  id: string;
  label: string;
  type: 'terminal' | 'output' | 'preview';
}

export function TerminalPanel() {
  const { runs, runCommand, showOutput, toggleOutput, runnerSession, killRunningProcess, sendErrorsToChat, project, setRuntimeType } = useIDE();
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const runtimeRef = useRef<HTMLDivElement>(null);

  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'output', label: 'Output', type: 'output' },
    { id: 'term-1', label: 'Terminal', type: 'terminal' },
  ]);
  const [activeTab, setActiveTab] = useState('term-1');
  const [terminalHistory, setTerminalHistory] = useState<Record<string, string[]>>({ 'term-1': [] });
  const [commandInput, setCommandInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentTab = tabs.find(t => t.id === activeTab);
  const lastRun = runs[runs.length - 1];
  const isRunning = lastRun?.status === 'running';
  const hasErrors = lastRun && (lastRun.status === 'error' || (lastRun.exitCode && lastRun.exitCode !== 0));

  // Detect server URLs in run output
  useEffect(() => {
    if (lastRun?.logs) {
      const url = detectServerUrl(lastRun.logs);
      if (url && url !== previewUrl) {
        setPreviewUrl(url);
        // Auto-add preview tab if not present
        if (!tabs.find(t => t.type === 'preview')) {
          setTabs(prev => [...prev, { id: 'preview', label: 'Preview', type: 'preview' }]);
        }
      }
    }
  }, [lastRun?.logs]);

  // Auto-scroll terminal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalHistory, runs]);

  // Focus input when panel opens or tab switches
  useEffect(() => {
    if (showOutput && currentTab?.type === 'terminal') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showOutput, activeTab, currentTab?.type]);

  // Close runtime dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (runtimeRef.current && !runtimeRef.current.contains(e.target as Node)) {
        setRuntimeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRun = useCallback(() => {
    const cmd = commandInput.trim();
    if (!cmd) return;

    setCmdHistory(prev => [...prev.filter(c => c !== cmd), cmd]);
    setHistoryIndex(-1);

    if (currentTab?.type === 'terminal') {
      setTerminalHistory(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), `$ ${cmd}`],
      }));

      if (cmd === 'clear') {
        setTerminalHistory(prev => ({ ...prev, [activeTab]: [] }));
        setCommandInput('');
        return;
      }
    }

    runCommand(cmd);
    setCommandInput('');
    if (!showOutput) toggleOutput();
  }, [commandInput, currentTab, activeTab, runCommand, showOutput, toggleOutput]);

  // Append run output to terminal history
  useEffect(() => {
    if (!lastRun || lastRun.status === 'running') return;
    const activeTermTab = tabs.find(t => t.id === activeTab && t.type === 'terminal');
    if (activeTermTab && lastRun.logs) {
      const outputLines = lastRun.logs.split('\n').filter(l => !l.startsWith('$ '));
      if (outputLines.length > 0) {
        setTerminalHistory(prev => ({
          ...prev,
          [activeTab]: [...(prev[activeTab] || []), ...outputLines],
        }));
      }
    }
  }, [lastRun?.status]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRun();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = historyIndex < cmdHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIdx);
        setCommandInput(cmdHistory[cmdHistory.length - 1 - newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setCommandInput(cmdHistory[cmdHistory.length - 1 - newIdx]);
      } else {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setTerminalHistory(prev => ({ ...prev, [activeTab]: [] }));
    }
  };

  const addTerminal = () => {
    const id = `term-${Date.now()}`;
    const num = tabs.filter(t => t.type === 'terminal').length + 1;
    setTabs(prev => [...prev, { id, label: `Terminal ${num}`, type: 'terminal' }]);
    setTerminalHistory(prev => ({ ...prev, [id]: [] }));
    setActiveTab(id);
  };

  const openPreviewManually = () => {
    if (!tabs.find(t => t.type === 'preview')) {
      setTabs(prev => [...prev, { id: 'preview', label: 'Preview', type: 'preview' }]);
    }
    if (!previewUrl) setPreviewUrl('http://localhost:3000');
    setActiveTab('preview');
  };

  const closeTab = (id: string) => {
    if (id === 'output') return;
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTab === id) setActiveTab(next[next.length - 1]?.id || 'output');
      return next;
    });
    if (id === 'preview') setPreviewUrl(null);
    setTerminalHistory(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const clearTerminal = () => {
    if (currentTab?.type === 'terminal') {
      setTerminalHistory(prev => ({ ...prev, [activeTab]: [] }));
    }
  };

  return (
    <div className={`border-t border-border bg-card transition-all ${showOutput ? 'h-[280px]' : 'h-8'}`}>
      {/* Header with tabs */}
      <div className="flex items-center justify-between h-8 bg-muted/30 border-b border-border shrink-0">
        <div className="flex items-center h-full overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-1.5 px-3 h-full text-xs border-r border-border transition-colors ${
                activeTab === tab.id
                  ? 'bg-card text-foreground border-b-2 border-b-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
              }`}
            >
              {tab.type === 'preview' ? <Globe className="h-3 w-3" /> : <Terminal className="h-3 w-3" />}
              {tab.label}
              {tab.id === 'output' && lastRun && (
                <span className={`ml-1 h-1.5 w-1.5 rounded-full ${
                  lastRun.status === 'success' ? 'bg-ide-success' :
                  lastRun.status === 'error' ? 'bg-ide-error' :
                  'bg-ide-warning animate-pulse'
                }`} />
              )}
              {tab.id !== 'output' && (
                <X
                  className="h-3 w-3 opacity-0 group-hover:opacity-100 hover:text-ide-error transition-opacity"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                />
              )}
            </button>
          ))}
          <button
            onClick={addTerminal}
            className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            title="New terminal"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={openPreviewManually}
            className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            title="Open browser preview"
          >
            <Globe className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-2 shrink-0">
          {hasErrors && activeTab === 'output' && (
            <button
              onClick={sendErrorsToChat}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-ide-error/10 text-ide-error rounded-sm hover:bg-ide-error/20 transition-colors"
              title="Send errors to Started"
            >
              <Send className="h-2.5 w-2.5" />
              Ask Started
            </button>
          )}
          <div className="relative" ref={runtimeRef}>
            <button
              onClick={() => setRuntimeOpen(prev => !prev)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded-sm hover:bg-accent/30 transition-colors"
              title="Select runtime"
            >
              <Cpu className="h-3 w-3" />
              {RUNTIME_TEMPLATES.find(t => t.type === project.runtimeType)?.label || project.runtimeType}
              <ChevronRight className={`h-2.5 w-2.5 transition-transform ${runtimeOpen ? 'rotate-90' : ''}`} />
            </button>
            {runtimeOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-40 max-h-52 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50">
                {RUNTIME_TEMPLATES.map(rt => (
                  <button
                    key={rt.type}
                    onClick={() => { setRuntimeType(rt.type as RuntimeType); setRuntimeOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
                      project.runtimeType === rt.type ? 'bg-accent font-semibold' : ''
                    }`}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={clearTerminal}
            className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent/30 transition-colors"
            title="Clear (Ctrl+L)"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button onClick={toggleOutput} className="p-1 text-muted-foreground hover:text-foreground">
            {showOutput ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showOutput && (
        <div className="flex flex-col h-[calc(100%-32px)]">
          {currentTab?.type === 'preview' && previewUrl ? (
            <BrowserPreview
              url={previewUrl}
              onClose={() => closeTab('preview')}
            />
          ) : (
            <>
              {/* Terminal/Output body */}
              <div ref={scrollRef} className="flex-1 overflow-auto p-2 font-mono text-xs bg-background/50">
                {activeTab === 'output' ? (
                  runs.length === 0 ? (
                    <p className="text-muted-foreground">No runs yet. Type a command below and press Enter.</p>
                  ) : (
                    runs.map(run => (
                      <div key={run.id} className="mb-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-[10px] mb-1">
                          <span className="inline-flex items-center gap-1">
                            {run.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-ide-warning" />}
                            {run.status === 'success' && <CheckCircle className="h-3 w-3 text-ide-success" />}
                            {run.status === 'error' && <XCircle className="h-3 w-3 text-ide-error" />}
                          </span>
                          <span className="text-foreground/60 font-semibold">$ {run.command}</span>
                          {run.durationMs !== undefined && (
                            <span className="inline-flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                          {run.cwd && (
                            <span className="inline-flex items-center gap-0.5">
                              <FolderOpen className="h-2.5 w-2.5" />
                              {run.cwd}
                            </span>
                          )}
                        </div>
                        <pre className="whitespace-pre-wrap text-foreground/80 pl-4 border-l-2 border-border">{run.logs}</pre>
                      </div>
                    ))
                  )
                ) : (
                  <>
                    {(terminalHistory[activeTab] || []).map((line, i) => (
                      <div key={i} className="leading-5">
                        {line.startsWith('$') ? (
                          <span className="text-primary">{line}</span>
                        ) : line.includes('⛔') || line.includes('⚠') || line.includes('Error') ? (
                          <span className="text-ide-error">{line}</span>
                        ) : line.startsWith('ℹ') ? (
                          <span className="text-ide-warning">{line}</span>
                        ) : (
                          <span className="text-foreground/80">{line}</span>
                        )}
                      </div>
                    ))}
                    {runs.length > 0 && (() => {
                      const last = runs[runs.length - 1];
                      if (last.status === 'running') {
                        return (
                          <div className="flex items-center gap-1.5 text-ide-warning mt-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Running...</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
              </div>

              {/* Command input */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted/20">
                {runnerSession && (
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    <FolderOpen className="h-3 w-3 inline mr-1" />
                    {runnerSession.cwd}
                  </span>
                )}
                <span className="text-xs text-primary font-mono font-bold shrink-0">$</span>
                <input
                  ref={inputRef}
                  value={commandInput}
                  onChange={e => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent text-sm font-mono text-foreground outline-none placeholder:text-muted-foreground/50"
                  placeholder="Type a command... (node -e, python -c, ruby -e, php -r, go, rust, etc.)"
                  disabled={isRunning}
                  autoFocus
                />
                {isRunning ? (
                  <button
                    onClick={() => killRunningProcess()}
                    className="flex items-center gap-1 px-2 py-1 bg-ide-error/10 text-ide-error text-xs rounded-sm hover:bg-ide-error/20 transition-colors"
                  >
                    <Square className="h-3 w-3" />
                    Kill
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    className="flex items-center gap-1 px-2 py-1 bg-ide-success/10 text-ide-success text-xs rounded-sm hover:bg-ide-success/20 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Run
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

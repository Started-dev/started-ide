import { useState } from 'react';
import { ChevronUp, ChevronDown, Play, Terminal, Square, CheckCircle, XCircle, Loader2, Clock, FolderOpen, Cpu, Send } from 'lucide-react';
import { useIDE } from '@/contexts/IDEContext';

export function OutputPanel() {
  const { runs, runCommand, showOutput, toggleOutput, runnerSession, killRunningProcess, sendErrorsToChat } = useIDE();
  const [commandInput, setCommandInput] = useState('npm start');

  const lastRun = runs[runs.length - 1];
  const isRunning = lastRun?.status === 'running';
  const hasErrors = lastRun && (lastRun.status === 'error' || (lastRun.exitCode && lastRun.exitCode !== 0));

  const handleRun = () => {
    if (commandInput.trim()) {
      runCommand(commandInput.trim());
    }
  };

  return (
    <div className={`border-t border-border bg-card transition-all ${showOutput ? 'h-[200px]' : 'h-8'}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 h-8 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={toggleOutput}
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</span>
          {lastRun && (
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm ${
              lastRun.status === 'success' ? 'bg-ide-success/10 text-ide-success' :
              lastRun.status === 'error' ? 'bg-ide-error/10 text-ide-error' :
              'bg-ide-warning/10 text-ide-warning'
            }`}>
              {lastRun.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
              {lastRun.status === 'success' && <CheckCircle className="h-3 w-3" />}
              {lastRun.status === 'error' && <XCircle className="h-3 w-3" />}
              {lastRun.status}
            </span>
          )}
          {runnerSession && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
              <Cpu className="h-3 w-3" />
              {runnerSession.runtimeType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {/* Send errors to Started button */}
          {hasErrors && (
            <button
              onClick={sendErrorsToChat}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-ide-error/10 text-ide-error rounded-sm hover:bg-ide-error/20 transition-colors"
              title="Send errors to Started for analysis"
            >
              <Send className="h-2.5 w-2.5" />
              Ask Started
            </button>
          )}
          {runnerSession && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <FolderOpen className="h-3 w-3" />
              {runnerSession.cwd}
            </span>
          )}
          <div onClick={toggleOutput}>
            {showOutput ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {showOutput && (
        <div className="flex flex-col h-[calc(100%-32px)]">
          {/* Command input */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
            <span className="text-xs text-muted-foreground font-mono">$</span>
            <input
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRun()}
              className="flex-1 bg-transparent text-sm font-mono text-foreground outline-none"
              placeholder="Enter command..."
              disabled={isRunning}
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

          {/* Logs */}
          <div className="flex-1 overflow-auto p-3 font-mono text-xs">
            {runs.length === 0 ? (
              <p className="text-muted-foreground">No runs yet. Click Run or press ⌘+Enter.</p>
            ) : (
              runs.map(run => (
                <div key={run.id} className="mb-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-[10px] mb-1">
                    <span>{run.timestamp.toLocaleTimeString()}</span>
                    {run.durationMs !== undefined && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                    {run.cwd && (
                      <span className="inline-flex items-center gap-0.5 font-mono">
                        <FolderOpen className="h-2.5 w-2.5" />
                        {run.cwd}
                      </span>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap text-foreground/80">{run.logs}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

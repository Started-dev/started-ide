import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Play, MessageSquare, Terminal, Command, Sparkles, Sun, Moon, BookOpen } from 'lucide-react';
import { FileTree } from './FileTree';
import { EditorPane } from './EditorPane';
import { ChatPanel } from './ChatPanel';
import { OutputPanel } from './OutputPanel';
import { CommandPalette } from './CommandPalette';
import { useIDE } from '@/contexts/IDEContext';

export function IDELayout() {
  const { showChat, toggleChat, toggleOutput, showOutput, project, runCommand, openFile, files, theme, toggleTheme, sendMessage, selectedText } = useIDE();

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+P — quick file open (handled by CommandPalette with file mode)
      if (mod && e.key === 'p') {
        e.preventDefault();
        // Dispatch Cmd+K to open palette (file search mode)
        const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
        window.dispatchEvent(evt);
      }

      // Cmd/Ctrl+Enter — send selection to Claude
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (selectedText) {
          sendMessage('Explain this code and suggest improvements.', [{
            type: 'selection', label: 'Selection', content: selectedText,
          }]);
        } else {
          runCommand('npm test');
        }
      }

      // Cmd+B — toggle chat
      if (mod && e.key === 'b') {
        e.preventDefault();
        toggleChat();
      }

      // Cmd+J — toggle output
      if (mod && e.key === 'j') {
        e.preventDefault();
        toggleOutput();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleChat, toggleOutput, runCommand, sendMessage, selectedText]);

  // Open CLAUDE.md
  const openProjectBrief = () => {
    const claudeFile = files.find(f => f.path === '/CLAUDE.md');
    if (claudeFile) openFile(claudeFile.id);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 h-10 bg-ide-panel-header border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Claude Code</span>
          </div>
          <span className="text-xs text-muted-foreground">—</span>
          <span className="text-xs text-muted-foreground font-mono">{project.name}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={openProjectBrief}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="Edit CLAUDE.md (Project Brief)"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Brief</span>
          </button>
          <button
            onClick={() => runCommand('npm start')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-ide-success/10 text-ide-success rounded-sm hover:bg-ide-success/20 transition-colors"
          >
            <Play className="h-3 w-3" />
            Run
          </button>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-sm text-muted-foreground hover:bg-accent/50 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={toggleOutput}
            className={`p-1.5 rounded-sm transition-colors ${showOutput ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            title="Toggle Output (⌘J)"
          >
            <Terminal className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleChat}
            className={`p-1.5 rounded-sm transition-colors ${showChat ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            title="Toggle Chat (⌘B)"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
              window.dispatchEvent(e);
            }}
            className="p-1.5 rounded-sm text-muted-foreground hover:bg-accent/50 transition-colors"
            title="Command Palette (⌘K)"
          >
            <Command className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* File tree */}
          <Panel defaultSize={15} minSize={10} maxSize={30}>
            <FileTree />
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />

          {/* Editor + Output */}
          <Panel defaultSize={showChat ? 55 : 85} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <EditorPane />
              </div>
              <OutputPanel />
            </div>
          </Panel>

          {/* Chat panel */}
          {showChat && (
            <>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              <Panel defaultSize={30} minSize={20} maxSize={45}>
                <ChatPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 h-6 bg-ide-panel-header border-t border-border text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>TypeScript</span>
          <span>UTF-8</span>
          <span>Spaces: 2</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-ide-success" />
            Connected
          </span>
          <span>⌘K commands · ⌘P files · ⌘⏎ send</span>
        </div>
      </div>

      <CommandPalette />
    </div>
  );
}

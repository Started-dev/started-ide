import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Play, MessageSquare, Terminal, Command, Sun, Moon, BookOpen, Brain, Plug, Anchor, LogOut, Clock, FolderOpen, ChevronDown, Users } from 'lucide-react';
import startedLogo from '@/assets/started-logo.png';
import { FileTree } from './FileTree';
import { EditorPane } from './EditorPane';
import { ChatPanel } from './ChatPanel';
import { TerminalPanel } from './TerminalPanel';
import { CommandPalette } from './CommandPalette';
import { AgentTimeline } from './AgentTimeline';
import { MCPConfig } from './MCPConfig';
import { HooksConfig } from './HooksConfig';
import { SnapshotBrowser } from './SnapshotBrowser';
import { ProjectSwitcher } from './ProjectSwitcher';
import { CollaborationPanel } from './CollaborationPanel';
import { PresenceAvatars } from './PresenceAvatars';
import { useIDE } from '@/contexts/IDEContext';
import { useAuth } from '@/contexts/AuthContext';

export function IDELayout() {
  const {
    showChat, toggleChat, toggleOutput, showOutput, project, runCommand,
    openFile, files, theme, toggleTheme, sendMessage, selectedText,
    agentRun, stopAgent, pauseAgent,
    activeRightPanel, setActiveRightPanel,
    mcpServers, toggleMCPServer,
    hooks, toggleHook, addHook, removeHook,
    snapshots, snapshotsLoading, loadSnapshots, createSnapshot, restoreSnapshot,
    projects, switchProject, createProject, renameProject, deleteProject,
    collaborators, collabMessages, fileLocks, presenceUsers,
    isProjectOwner, inviteCollaborator, removeCollaborator, sendCollabMessage,
  } = useIDE();
  const { signOut, user } = useAuth();

  const [showMCP, setShowMCP] = useState(false);
  const [showHooks, setShowHooks] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const [showCollab, setShowCollab] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'p') {
        e.preventDefault();
        const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
        window.dispatchEvent(evt);
      }
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
      if (mod && e.key === 'b') { e.preventDefault(); toggleChat(); }
      if (mod && e.key === 'j') { e.preventDefault(); toggleOutput(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleChat, toggleOutput, runCommand, sendMessage, selectedText]);

  const openProjectBrief = () => {
    const startedFile = files.find(f => f.path === '/STARTED.md');
    if (startedFile) openFile(startedFile.id);
  };

  const isAgentActive = agentRun?.status === 'running' || agentRun?.status === 'queued';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 h-10 bg-ide-panel-header border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src={startedLogo} alt="Started" className="h-6 w-6 rounded-full" />
            <span className="text-sm font-semibold text-foreground">Started</span>
          </div>
          <button
            onClick={() => setShowProjectSwitcher(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-muted-foreground font-mono hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="Switch project"
          >
            <FolderOpen className="h-3 w-3" />
            {project.name}
            <ChevronDown className="h-3 w-3" />
          </button>
          {isAgentActive && (
            <span className="text-[10px] px-1.5 py-0.5 bg-ide-warning/15 text-ide-warning rounded-sm animate-pulse">
              Agent running
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={openProjectBrief}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="Edit STARTED.md (Project Brief)"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Brief</span>
          </button>
          <button
            onClick={() => setShowHooks(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="Configure Hooks"
          >
            <Anchor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hooks</span>
          </button>
          <button
            onClick={() => { setShowSnapshots(true); loadSnapshots(); }}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="File Snapshots"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Snapshots</span>
          </button>
          <button
            onClick={() => setShowMCP(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="MCP Servers"
          >
            <Plug className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">MCP</span>
          </button>
          <PresenceAvatars users={presenceUsers} onClick={() => setShowCollab(true)} />
          <button
            onClick={() => setShowCollab(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title="Collaboration"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Collab</span>
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => runCommand('npm start')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-ide-success/10 text-ide-success rounded-sm hover:bg-ide-success/20 transition-colors"
          >
            <Play className="h-3 w-3" />
            Run
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-sm transition-colors"
            title={`Sign out (${user?.email})`}
          >
            <LogOut className="h-3.5 w-3.5" />
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
          {/* Chat / Agent tab switcher */}
          <div className="flex items-center border border-border rounded-sm overflow-hidden ml-1">
            <button
              onClick={() => { if (!showChat) toggleChat(); setActiveRightPanel('chat'); }}
              className={`p-1.5 transition-colors ${
                showChat && activeRightPanel === 'chat'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              }`}
              title="Chat (⌘B)"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { if (!showChat) toggleChat(); setActiveRightPanel('agent'); }}
              className={`p-1.5 transition-colors ${
                showChat && activeRightPanel === 'agent'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              }`}
              title="Agent Timeline"
            >
              <Brain className="h-3.5 w-3.5" />
            </button>
          </div>
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
          <Panel defaultSize={15} minSize={10} maxSize={30}>
            <FileTree />
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />

          <Panel defaultSize={showChat ? 55 : 85} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="flex-1 min-h-0">
                <EditorPane />
              </div>
              <TerminalPanel />
            </div>
          </Panel>

          {showChat && (
            <>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              <Panel defaultSize={30} minSize={20} maxSize={45}>
                {activeRightPanel === 'chat' ? (
                  <ChatPanel />
                ) : (
                  <AgentTimeline
                    agentRun={agentRun}
                    onStop={stopAgent}
                    onPause={pauseAgent}
                  />
                )}
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
          {mcpServers.filter(s => s.enabled).length > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Plug className="h-2.5 w-2.5" />
              {mcpServers.filter(s => s.enabled).length} MCP
            </span>
          )}
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
      {showMCP && <MCPConfig servers={mcpServers} onToggleServer={toggleMCPServer} onClose={() => setShowMCP(false)} />}
      {showHooks && <HooksConfig hooks={hooks} onToggleHook={toggleHook} onAddHook={addHook} onRemoveHook={removeHook} onClose={() => setShowHooks(false)} />}
      {showSnapshots && (
        <SnapshotBrowser
          snapshots={snapshots}
          loading={snapshotsLoading}
          onClose={() => setShowSnapshots(false)}
          onCreateSnapshot={(label) => createSnapshot(label)}
          onRestoreSnapshot={(id) => { restoreSnapshot(id); setShowSnapshots(false); }}
        />
      )}
      {showProjectSwitcher && (
        <ProjectSwitcher
          projects={projects}
          currentProjectId={project.id}
          onSwitch={(id) => { switchProject(id); setShowProjectSwitcher(false); }}
          onCreate={(name) => { createProject(name); setShowProjectSwitcher(false); }}
          onRename={renameProject}
          onDelete={deleteProject}
          onClose={() => setShowProjectSwitcher(false)}
        />
      )}
      {showCollab && (
        <CollaborationPanel
          collaborators={collaborators}
          messages={collabMessages}
          fileLocks={fileLocks}
          presenceUsers={presenceUsers}
          currentUserId={user?.id || ''}
          currentUserEmail={user?.email || ''}
          isOwner={isProjectOwner}
          onInvite={inviteCollaborator}
          onRemoveCollaborator={removeCollaborator}
          onSendMessage={sendCollabMessage}
          onClose={() => setShowCollab(false)}
        />
      )}
    </div>
  );
}

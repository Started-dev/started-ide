import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  Play, MessageSquare, Terminal, Command, Sun, Moon, Brain,
  LogOut, Clock, FolderOpen, ChevronDown, Users, User,
  Rocket, Activity, Globe2, Plug, GitBranch, Eye, EyeOff,
} from 'lucide-react';
import startedWordmark from '@/assets/started-wordmark.svg';
import startedWordmarkLight from '@/assets/started-wordmark-light.svg';
import { useTheme } from 'next-themes';
import { FileTree } from './FileTree';
import { EditorPane } from './EditorPane';
import { ChatPanel } from './ChatPanel';
import { TerminalPanel } from './TerminalPanel';
import { CommandPalette } from './CommandPalette';
import { AgentTimeline } from './AgentTimeline';
import { SnapshotBrowser } from './SnapshotBrowser';
import { ProjectSwitcher } from './ProjectSwitcher';
import { CollaborationPanel } from './CollaborationPanel';
import { TransactionBuilder } from './TransactionBuilder';
import { PresenceAvatars } from './PresenceAvatars';
import { CICDPanel } from './CICDPanel';
import { OpenClawPanel } from './OpenClawPanel';
import { EventTimeline } from './EventTimeline';
import { ProtocolZone } from './ProtocolZone';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NavIconButton } from './NavIconButton';
import { useIDE } from '@/contexts/IDEContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOpenClawEvents } from '@/hooks/use-openclaw-events';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function IDELayout() {
  const navigate = useNavigate();
  const {
    showChat, toggleChat, toggleOutput, showOutput, project, runCommand,
    openFile, files, theme, toggleTheme, sendMessage, selectedText,
    agentRun, stopAgent, pauseAgent, clearAgentRun,
    activeRightPanel, setActiveRightPanel,
    mcpServers, toggleMCPServer,
    hooks, toggleHook, addHook, removeHook,
    webhookSecrets, hookExecutions, generateWebhookSecret, deleteWebhookSecret, refreshHookExecutions,
    snapshots, snapshotsLoading, loadSnapshots, createSnapshot, restoreSnapshot,
    projects, switchProject, createProject, renameProject, deleteProject,
    collaborators, collabMessages, fileLocks, presenceUsers,
    isProjectOwner, inviteCollaborator, removeCollaborator, sendCollabMessage,
  } = useIDE();
  const { signOut, user } = useAuth();

  useOpenClawEvents(project?.id);
  const { resolvedTheme } = useTheme();
  const wordmark = resolvedTheme === 'light' ? startedWordmarkLight : startedWordmark;

  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showProjectSwitcher, setShowProjectSwitcher] = useState(false);
  const [showCollab, setShowCollab] = useState(false);
  const [showTxBuilder, setShowTxBuilder] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showCICD, setShowCICD] = useState(false);
  const [showOpenClaw, setShowOpenClaw] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [userPlanKey, setUserPlanKey] = useState<string>('free');

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('api_usage_ledger').select('plan_key').eq('owner_id', user.id)
      .order('period_start', { ascending: false }).limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setUserPlanKey(data[0].plan_key);
      });
  }, [user?.id]);

  const handleCollabClick = () => {
    if (userPlanKey === 'pro' || userPlanKey === 'studio') {
      setShowCollab(true);
    } else {
      toast.error('Collaboration is available on Pro and Studio plans. Upgrade in Settings.');
    }
  };

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

  const isAgentActive = agentRun?.status === 'running' || agentRun?.status === 'queued';
  const activeMCP = mcpServers.filter(s => s.enabled).length;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* ─── Top Navigation ─── */}
      <div className="flex items-center justify-between px-3 h-11 bg-ide-panel-header border-b border-border shrink-0">
        {/* LEFT: Logo + Project + Branch + ⌘K */}
        <div className="flex items-center gap-2.5">
          <img src={wordmark} alt="Started" className="h-6 opacity-90" />

          <div className="w-px h-5 bg-border" />

          <button
            onClick={() => setShowProjectSwitcher(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground font-mono hover:text-foreground hover:bg-accent/40 rounded-md transition-all duration-150"
            title="Switch project"
          >
            <FolderOpen className="h-3 w-3" />
            <span className="max-w-[120px] truncate">{project.name}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>

          <button
            onClick={() => { setShowSnapshots(true); loadSnapshots(); }}
            className="flex items-center gap-1 px-1.5 py-1 text-xs text-muted-foreground/60 font-mono hover:text-foreground hover:bg-accent/40 rounded-md transition-all duration-150"
            title="Snapshots"
          >
            <GitBranch className="h-3 w-3" />
            <span className="hidden lg:inline">main</span>
            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
                  window.dispatchEvent(e);
                }}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground/50 hover:text-foreground bg-accent/20 hover:bg-accent/40 rounded-md transition-all duration-150 border border-border/50"
              >
                <Command className="h-3 w-3" />
                <span className="hidden sm:inline text-[10px]">⌘K</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Command Palette</TooltipContent>
          </Tooltip>

          {isAgentActive && (
            <span className="text-[10px] px-1.5 py-0.5 bg-ide-warning/15 text-ide-warning rounded-md animate-pulse font-medium">
              Agent running
            </span>
          )}
        </div>

        {/* CENTER: breathing room — empty */}
        <div className="flex-1" />

        {/* RIGHT: Primary actions + Utility icons */}
        <div className="flex items-center gap-1">
          {/* ── Primary: Run ── */}
          <button
            onClick={() => runCommand('npm start')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-ide-success/15 text-ide-success rounded-md hover:bg-ide-success/25 transition-all duration-150 border border-ide-success/20"
          >
            <Play className="h-3 w-3" />
            Run
          </button>

          {/* ── Primary: Agent toggle ── */}
          <div className="flex items-center border border-border rounded-md overflow-hidden ml-1">
            <button
              onClick={() => { if (!showChat) toggleChat(); setActiveRightPanel('chat'); }}
              className={`p-1.5 transition-all duration-150 ${
                showChat && activeRightPanel === 'chat'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
              title="Chat (⌘B)"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { if (!showChat) toggleChat(); setActiveRightPanel('agent'); }}
              className={`relative p-1.5 transition-all duration-150 ${
                showChat && activeRightPanel === 'agent'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              }`}
              title="Agent Timeline"
            >
              <Brain className="h-3.5 w-3.5" />
              {isAgentActive && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-ide-warning animate-pulse" />
              )}
            </button>
          </div>

          {!focusMode && (
            <>
              <div className="w-px h-5 bg-border mx-1" />

              {/* ── Utility icons ── */}
              <NavIconButton
                icon={<Clock className="h-3.5 w-3.5" />}
                tooltip="Timeline"
                onClick={() => { if (!showChat) toggleChat(); setActiveRightPanel('timeline' as any); }}
                active={showChat && (activeRightPanel as string) === 'timeline'}
              />
              <NavIconButton
                icon={<Activity className="h-3.5 w-3.5" />}
                tooltip="Runner"
                onClick={toggleOutput}
                active={showOutput}
                status={{ color: 'green' }}
              />
              <NavIconButton
                icon={<Plug className="h-3.5 w-3.5" />}
                tooltip="Integrations"
                onClick={() => setShowIntegrations(true)}
                status={activeMCP > 0 ? { color: 'green' } : undefined}
              />
              <NavIconButton
                icon={<Rocket className="h-3.5 w-3.5" />}
                tooltip="CI/CD"
                onClick={() => setShowCICD(true)}
              />
              <NavIconButton
                icon={<Globe2 className="h-3.5 w-3.5" />}
                tooltip="Protocol Zone"
                onClick={() => { if (!showChat) toggleChat(); setActiveRightPanel('protocol' as any); }}
                active={showChat && (activeRightPanel as string) === 'protocol'}
              />
              <NavIconButton
                icon={<Users className="h-3.5 w-3.5" />}
                tooltip="Collaboration"
                onClick={handleCollabClick}
              />

              <div className="w-px h-5 bg-border mx-1" />

              <NavIconButton
                icon={theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                tooltip={`${theme === 'dark' ? 'Light' : 'Dark'} mode`}
                onClick={toggleTheme}
              />
              <NavIconButton
                icon={<User className="h-3.5 w-3.5" />}
                tooltip="Settings"
                onClick={() => navigate('/settings')}
              />
              <NavIconButton
                icon={<LogOut className="h-3.5 w-3.5" />}
                tooltip={`Sign out (${user?.email})`}
                onClick={signOut}
              />
            </>
          )}

          {/* Focus mode toggle — always visible */}
          <NavIconButton
            icon={focusMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            tooltip={focusMode ? 'Exit Focus Mode' : 'Focus Mode'}
            onClick={() => setFocusMode(prev => !prev)}
            active={focusMode}
            className={focusMode ? 'text-primary' : ''}
          />
        </div>
      </div>

      {/* ─── Main content ─── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <PanelGroup direction="horizontal" className="flex-1">
          {!focusMode && (
            <>
              <Panel defaultSize={15} minSize={10} maxSize={30}>
                <FileTree />
              </Panel>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
            </>
          )}

          <Panel defaultSize={showChat ? (focusMode ? 70 : 55) : (focusMode ? 100 : 85)} minSize={30}>
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
                ) : (activeRightPanel as string) === 'timeline' ? (
                  <EventTimeline />
                ) : (activeRightPanel as string) === 'protocol' ? (
                  <ProtocolZone />
                ) : (
                  <AgentTimeline
                    agentRun={agentRun}
                    onStop={stopAgent}
                    onPause={pauseAgent}
                    onOpenFile={(path) => {
                      const file = files.find(f => f.path === path || `/${f.path}` === path);
                      if (file) openFile(file.id);
                    }}
                    onNewRun={() => {
                      clearAgentRun();
                      setActiveRightPanel('chat');
                    }}
                  />
                )}
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* ─── Status bar ─── */}
      {!focusMode && (
        <div className="flex items-center justify-between px-3 h-6 bg-ide-panel-header border-t border-border text-[10px] text-muted-foreground shrink-0">
          <div className="flex items-center gap-3">
            <span>TypeScript</span>
            <span>UTF-8</span>
            <span>Spaces: 2</span>
            {activeMCP > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Plug className="h-2.5 w-2.5" />
                {activeMCP} MCP
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
      )}

      {/* ─── Modals ─── */}
      <CommandPalette focusMode={focusMode} setFocusMode={setFocusMode} />
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
      {showTxBuilder && <TransactionBuilder onClose={() => setShowTxBuilder(false)} />}
      {showCICD && <CICDPanel projectId={project.id} onClose={() => setShowCICD(false)} />}
      {showOpenClaw && <OpenClawPanel onClose={() => setShowOpenClaw(false)} />}
      {showIntegrations && (
        <IntegrationsPanel
          onClose={() => setShowIntegrations(false)}
          mcpServers={mcpServers}
          onToggleMCPServer={toggleMCPServer}
          hooks={hooks}
          onToggleHook={toggleHook}
          onAddHook={addHook}
          onRemoveHook={removeHook}
          webhookSecrets={webhookSecrets}
          hookExecutions={hookExecutions}
          onGenerateSecret={generateWebhookSecret}
          onDeleteSecret={deleteWebhookSecret}
          onRefreshExecutions={refreshHookExecutions}
          webhookBaseUrl={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-webhooks`}
          projectId={project.id}
          onOpenTxBuilder={() => setShowTxBuilder(true)}
        />
      )}
    </div>
  );
}

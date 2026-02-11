import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { IDEFile, OpenTab, ChatMessage, RunResult, Project, ContextChip, Conversation } from '@/types/ide';
import { ToolCall, ToolName, PatchPreview, ParsedPatch, PermissionPolicy, DEFAULT_PERMISSION_POLICY } from '@/types/tools';
import { supabase } from '@/integrations/supabase/client';
import { RunnerSession, RuntimeType } from '@/types/runner';
import { AgentRun, AgentStep, Hook, DEFAULT_HOOKS, MCPServer, BUILTIN_MCP_SERVERS, WebhookSecret, HookExecution } from '@/types/agent';
import { useProjectHooks } from '@/hooks/use-project-hooks';
import { STARTED_SYSTEM_PROMPT } from '@/lib/started-prompt';
import { evaluatePermission, executeToolLocally } from '@/lib/tool-executor';
import { getRunnerClient, IRunnerClient } from '@/lib/runner-client';
import { parseUnifiedDiff, applyPatchToContent, extractDiffFromMessage, extractCommandsFromMessage, extractFileBlocksFromMessage } from '@/lib/patch-utils';
import { streamChat, runCommandRemote, streamAgent, getAgentRunStatus, cancelAgentRun, PermissionRequest } from '@/lib/api-client';
import { generateChatTitle } from '@/lib/chat-title';
import { triggerEventHooks, isDeployCommand, isErrorExit } from '@/lib/event-hooks';
import { detectRuntime } from '@/lib/detect-runtime';
import { RUNTIME_TEMPLATES } from '@/types/runner';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectPersistence } from '@/hooks/use-project-persistence';
import { useConversationPersistence } from '@/hooks/use-conversation-persistence';
import type { ProjectInfo } from '@/hooks/use-project-persistence';
import { useFileSnapshots } from '@/hooks/use-file-snapshots';
import type { Snapshot } from '@/hooks/use-file-snapshots';
import { useCASnapshots } from '@/hooks/use-ca-snapshots';
import { useCollaboration } from '@/hooks/use-collaboration';
import type { Collaborator, CollabMessage, FileLock, PresenceUser } from '@/hooks/use-collaboration';

export const STARTED_MD_CONTENT = `# Started Project Brief

This project is managed inside **Started.dev**.
AI agents and automated tools may read, modify, and run code in this repository
according to the rules defined below.

This document is the **source of truth** for how changes should be made.

---

## 1. Project Overview

**Purpose:**
> Describe what this project does in 1–3 sentences.

**Primary Language(s):**
- (e.g. TypeScript, Python, Solidity)

**Frameworks / Tooling:**
- (e.g. Node.js, Next.js, Foundry, Hardhat, React)

**Runtime Environment:**
- (e.g. Node 18, Deno, Browser, EVM)

---

## 2. How to Run, Build, and Test

**Install dependencies:**
\\\`\\\`\\\`bash
npm install
\\\`\\\`\\\`

**Run locally:**
\\\`\\\`\\\`bash
npm run start
\\\`\\\`\\\`

**Run tests:**
\\\`\\\`\\\`bash
npm test
\\\`\\\`\\\`

**Build / compile:**
\\\`\\\`\\\`bash
npm run build
\\\`\\\`\\\`

If any of these commands change, update this file immediately.

---

## 3. Repository Structure

\\\`\\\`\\\`
/src        -> main application logic
/tests      -> automated tests
/scripts    -> tooling / automation
\\\`\\\`\\\`

Highlight:
- entry points
- config files
- generated code (if any)

---

## 4. Coding Standards

Follow these rules strictly:
- Prefer clarity over cleverness
- Small, focused functions
- Avoid unnecessary abstractions
- Keep changes minimal and scoped
- Do not reformat unrelated code

**Style:**
- Indentation: 2 spaces
- Quotes: single quotes
- Semicolons: yes

---

## 5. AI Change Policy (IMPORTANT)

**AI agents must:**
- Always inspect files before editing
- Use unified diffs for changes
- Prefer small patches over large rewrites
- Run tests or builds when possible
- Explain the intent of changes clearly

**AI agents must NOT:**
- Touch .env, secrets, or credentials without explicit permission
- Introduce new dependencies unless necessary
- Modify files outside the stated scope
- Run destructive commands

---

## 6. Terminal & Runner Rules

- Commands should be safe and minimal
- Prefer read-only inspection commands first
- Avoid network access unless required
- Never run destructive or privileged commands

If a command fails:
1. Read the error
2. Fix the root cause
3. Re-run verification

---

## 7. Autonomous Agent Rules

When Agent Mode is enabled:
- Break work into steps
- Verify progress after each step
- Stop if blocked or uncertain
- Do not repeat failing actions endlessly
- Require confirmation for risky actions (deploys, pushes, state changes)

---

## 8. Testing & Verification Expectations

- Existing tests must pass before declaring success
- If no tests exist:
  - Suggest adding tests for non-trivial changes
- Clearly report verification results

---

## 9. Web3 / MCP Rules (If Applicable)

- Prefer MCP tools over guessing on-chain data
- Treat blockchain data as read-only unless authorized
- Never generate or expose private keys
- Simulate before deploying
- Explain risks before any state-changing action

---

## 10. Definition of Done

A task is complete when:
- The requested change is implemented
- Code builds or tests pass (or failures are explained)
- The solution is safe, minimal, and production-ready
- The intent and outcome are clearly communicated

---

## 11. Notes for Humans

Use this space for:
- architectural decisions
- known limitations
- future plans
- warnings or edge cases
`;

const DEMO_FILES: IDEFile[] = [
  { id: 'root-src', name: 'src', path: '/src', content: '', language: '', parentId: null, isFolder: true },
  { id: 'f-started-md', name: 'STARTED.md', path: '/STARTED.md', content: STARTED_MD_CONTENT, language: 'markdown', parentId: null, isFolder: false },
  { id: 'f-main', name: 'main.ts', path: '/src/main.ts', content: `import { greet } from './utils';\n\nconst name = process.argv[2] || 'World';\nconsole.log(greet(name));\nconsole.log('Started Cloud IDE is running!');\n`, language: 'typescript', parentId: 'root-src', isFolder: false },
  { id: 'f-utils', name: 'utils.ts', path: '/src/utils.ts', content: `export function greet(name: string): string {\n  return \`Hello, \${name}! Welcome to Started.\`;\n}\n\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`, language: 'typescript', parentId: 'root-src', isFolder: false },
  { id: 'f-readme', name: 'README.md', path: '/README.md', content: `# Demo Project\n\nA simple TypeScript project to demonstrate the Started Cloud IDE.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\n## Features\n\n- TypeScript support\n- AI assistance\n- Live preview\n`, language: 'markdown', parentId: null, isFolder: false },
  { id: 'f-pkg', name: 'package.json', path: '/package.json', content: `{\n  "name": "demo-project",\n  "version": "1.0.0",\n  "main": "src/main.ts",\n  "scripts": {\n    "start": "ts-node src/main.ts",\n    "test": "jest"\n  }\n}\n`, language: 'json', parentId: null, isFolder: false },
  { id: 'f-tsconfig', name: 'tsconfig.json', path: '/tsconfig.json', content: `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "commonjs",\n    "strict": true,\n    "outDir": "./dist"\n  },\n  "include": ["src/**/*"]\n}\n`, language: 'json', parentId: null, isFolder: false },
];

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
  jsx: 'javascriptreact', json: 'json', md: 'markdown',
  py: 'python', css: 'css', html: 'html',
  go: 'go', rs: 'rust', c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  php: 'php', rb: 'ruby', java: 'java', sol: 'solidity',
  dart: 'dart', swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  r: 'r', sh: 'shell', bash: 'shell',
};

import type { ModelId } from '@/components/ide/ModelSelector';

import type { RunnerStatus } from '@/types/ide';

interface IDEContextType {
  project: Project;
  setRuntimeType: (rt: RuntimeType) => void;
  files: IDEFile[];
  openTabs: OpenTab[];
  activeTabId: string | null;
  chatMessages: ChatMessage[];
  runs: RunResult[];
  showOutput: boolean;
  showChat: boolean;
  selectedText: string;
  setSelectedText: (text: string) => void;
  openFile: (fileId: string) => void;
  closeTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  updateFileContent: (fileId: string, content: string) => void;
  createFile: (name: string, parentId: string | null, isFolder: boolean) => void;
  deleteFile: (fileId: string) => void;
  renameFile: (fileId: string, newName: string) => void;
  sendMessage: (content: string, chips?: ChatMessage['contextChips']) => void;
  runCommand: (command: string) => void;
  toggleOutput: () => void;
  toggleChat: () => void;
  getFileById: (id: string) => IDEFile | undefined;
  toolCalls: ToolCall[];
  pendingPatches: PatchPreview[];
  permissionPolicy: PermissionPolicy;
  approveToolCall: (id: string) => void;
  denyToolCall: (id: string) => void;
  alwaysAllowTool: (toolName: ToolName) => void;
  alwaysAllowCommand: (command: string) => void;
  applyPatch: (patchId: string) => void;
  applyPatchAndRun: (patchId: string, command: string) => void;
  cancelPatch: (patchId: string) => void;
  runnerSession: RunnerSession | null;
  killRunningProcess: () => void;
  sendErrorsToChat: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  agentRun: AgentRun | null;
  startAgent: (goal: string) => void;
  stopAgent: () => void;
  pauseAgent: () => void;
  clearAgentRun: () => void;
  hooks: Hook[];
  toggleHook: (id: string) => void;
  addHook: (hook: Omit<Hook, 'id'>) => void;
  removeHook: (id: string) => void;
  webhookSecrets: WebhookSecret[];
  hookExecutions: HookExecution[];
  generateWebhookSecret: (label: string) => Promise<WebhookSecret | null>;
  deleteWebhookSecret: (id: string) => void;
  refreshHookExecutions: () => void;
  mcpServers: MCPServer[];
  toggleMCPServer: (id: string) => void;
  activeRightPanel: 'chat' | 'agent' | 'timeline' | 'protocol';
  setActiveRightPanel: (panel: 'chat' | 'agent' | 'timeline' | 'protocol') => void;
  snapshots: Snapshot[];
  snapshotsLoading: boolean;
  loadSnapshots: () => void;
  createSnapshot: (label?: string) => void;
  restoreSnapshot: (snapshotId: string) => void;
  conversations: Conversation[];
  activeConversationId: string;
  switchConversation: (conversationId: string) => void;
  newConversation: () => void;
  deleteConversation: (conversationId: string) => void;
  projects: ProjectInfo[];
  switchProject: (projectId: string) => void;
  createProject: (name: string) => void;
  renameProject: (projectId: string, name: string) => void;
  deleteProject: (projectId: string) => void;
  collaborators: Collaborator[];
  collabMessages: CollabMessage[];
  fileLocks: FileLock[];
  presenceUsers: PresenceUser[];
  collabLoading: boolean;
  inviteCollaborator: (email: string, role: 'viewer' | 'editor') => void;
  removeCollaborator: (id: string) => void;
  sendCollabMessage: (content: string) => void;
  lockFile: (filePath: string) => Promise<boolean>;
  unlockFile: (filePath: string) => void;
  isFileLocked: (filePath: string) => FileLock | null;
  isFileLockedByMe: (filePath: string) => boolean;
  trackActiveFile: (filePath: string | null) => void;
  isProjectOwner: boolean;
  pendingPermission: (PermissionRequest & { runId: string }) | null;
  approvePermission: () => void;
  denyPermission: () => void;
  alwaysAllowPermission: () => void;
  selectedModel: ModelId;
  setSelectedModel: (model: ModelId) => void;
  runnerStatus: RunnerStatus;
}

const IDEContext = createContext<IDEContextType | null>(null);

export function IDEProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { projectId, loading: persistenceLoading, initialFiles, projects, saveFile, deleteFileFromDB, saveAllFiles, switchProject: switchProjectRaw, createProject: createProjectRaw, renameProject: renameProjectRaw, deleteProject: deleteProjectRaw } = useProjectPersistence(user);
  const { snapshots, loading: snapshotsLoading, loadSnapshots, createSnapshot: createSnapshotRaw, getSnapshotFiles } = useFileSnapshots(projectId);
  const caSnapshots = useCASnapshots(projectId);
  const collab = useCollaboration(projectId, user?.id || null, user?.email || null);
  const convPersistence = useConversationPersistence(projectId, user);
  const isProjectOwner = !!user && projects.some(p => p.id === projectId);

  const [project, setProject] = useState<Project>({ id: 'demo-1', name: 'demo-project', runtimeType: 'node', files: [] });
  const runnerClientRef = useRef<IRunnerClient>(getRunnerClient());
  const [runnerSession, setRunnerSession] = useState<RunnerSession | null>(null);
  const [filesReady, setFilesReady] = useState(false);
  const [files, setFiles] = useState<IDEFile[]>(DEMO_FILES);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([
    { fileId: 'f-main', name: 'main.ts', path: '/src/main.ts', isModified: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string | null>('f-main');
  const makeWelcomeMessage = (): ChatMessage => ({
    id: 'welcome-' + Date.now(), role: 'assistant',
    content: "Hello! I'm Started, your AI coding assistant. I can help you write, debug, and refactor code. Select some code or mention a file to get started.\n\nTry asking me to:\n- Explain a function\n- Add error handling\n- Write tests\n- Refactor code\n\n**Agent Mode**: Click the 🧠 Agent tab to run autonomous multi-step tasks.",
    timestamp: new Date(),
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([makeWelcomeMessage()]);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [showOutput, setShowOutput] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [pendingPatches, setPendingPatches] = useState<PatchPreview[]>([]);
  const [permissionPolicy, setPermissionPolicy] = useState<PermissionPolicy>(DEFAULT_PERMISSION_POLICY);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [pendingPermission, setPendingPermission] = useState<(PermissionRequest & { runId: string }) | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>('started/started-ai');
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>('disconnected');

  // Agent state
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const agentAbortRef = useRef(false);
  const agentServerRunIdRef = useRef<string | null>(null);

  // ─── filesRef: always-current files for async callbacks ───
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  // ─── Local conversations (optimistic, works without auth) ───
  const [localConversations, setLocalConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const convInitializedRef = useRef<string | null>(null);

  // Merged conversations: DB + local-only (deduped by id)
  const dbConversations = convPersistence.conversations.filter(c => c.projectId === projectId);
  const mergedConversations = React.useMemo(() => {
    const byId = new Map<string, Conversation>();
    for (const c of dbConversations) byId.set(c.id, c);
    for (const c of localConversations) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return Array.from(byId.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [dbConversations, localConversations]);

  const makeNewConversation = useCallback((pId: string): Conversation => ({
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [makeWelcomeMessage()],
    createdAt: new Date(),
    projectId: pId,
  }), []);

  const deriveTitle = (msgs: ChatMessage[]): string => {
    const firstUser = msgs.find(m => m.role === 'user');
    if (!firstUser) return 'New Chat';
    return firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '…' : '');
  };

  // Track whether AI title generation has been triggered for the active conversation
  const titleGeneratedRef = useRef<Set<string>>(new Set());

  // Initialize conversations when project loads
  useEffect(() => {
    if (!projectId || convPersistence.loading) return;
    if (convInitializedRef.current === projectId) return;

    const projectConvs = convPersistence.conversations.filter(c => c.projectId === projectId);
    if (projectConvs.length > 0) {
      convInitializedRef.current = projectId;
      const latest = projectConvs[projectConvs.length - 1];
      setActiveConversationId(latest.id);
      setChatMessages(latest.messages);
      setLocalConversations([]);
    } else {
      convInitializedRef.current = projectId;
      const newConv = makeNewConversation(projectId);
      setActiveConversationId(newConv.id);
      setChatMessages(newConv.messages);
      setLocalConversations([newConv]);
      convPersistence.createConversation(newConv);
    }
    // Don't clear agentRun on project load — agent runs independently
    setActiveRightPanel(agentRun?.status === 'running' ? 'agent' : 'chat');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, convPersistence.loading, convPersistence.conversations]);

  // Sync chatMessages to DB (debounced)
  const prevMessagesRef = useRef(chatMessages);
  useEffect(() => {
    if (!activeConversationId || chatMessages === prevMessagesRef.current) {
      prevMessagesRef.current = chatMessages;
      return;
    }
    prevMessagesRef.current = chatMessages;
    const title = deriveTitle(chatMessages);
    convPersistence.saveConversation(activeConversationId, chatMessages, title);
    // Also update local conversations with new title
    setLocalConversations(prev => prev.map(c =>
      c.id === activeConversationId ? { ...c, messages: chatMessages, title } : c
    ));
  }, [chatMessages, activeConversationId, convPersistence.saveConversation]);

  const switchConversation = useCallback((conversationId: string) => {
    if (activeConversationId) {
      convPersistence.saveConversation(activeConversationId, chatMessages, deriveTitle(chatMessages));
    }
    // Look in merged list
    const target = mergedConversations.find(c => c.id === conversationId);
    if (target) {
      setChatMessages(target.messages);
      setActiveConversationId(conversationId);
      // Don't clear agentRun — it runs independently
      setActiveRightPanel('chat');
    }
  }, [activeConversationId, chatMessages, convPersistence, mergedConversations]);

  const newConversation = useCallback(() => {
    if (!projectId) return;
    // Save current
    if (activeConversationId) {
      convPersistence.saveConversation(activeConversationId, chatMessages, deriveTitle(chatMessages));
    }
    const newConv = makeNewConversation(projectId);
    // Add to local immediately (optimistic)
    setLocalConversations(prev => [...prev, newConv]);
    setActiveConversationId(newConv.id);
    setChatMessages(newConv.messages);
    // Don't clear agentRun — it runs independently
    setActiveRightPanel('chat');
    // Persist to DB (fire and forget)
    convPersistence.createConversation(newConv);
  }, [projectId, activeConversationId, chatMessages, makeNewConversation, convPersistence]);

  const deleteConversation = useCallback((conversationId: string) => {
    if (!projectId) return;
    convPersistence.deleteConversationFromDB(conversationId);
    setLocalConversations(prev => prev.filter(c => c.id !== conversationId));
    
    if (conversationId === activeConversationId) {
      const remaining = mergedConversations.filter(c => c.id !== conversationId);
      if (remaining.length > 0) {
        const latest = remaining[remaining.length - 1];
        setActiveConversationId(latest.id);
        setChatMessages(latest.messages);
      } else {
        const newConv = makeNewConversation(projectId);
        setLocalConversations(prev => [...prev, newConv]);
        setActiveConversationId(newConv.id);
        setChatMessages(newConv.messages);
        convPersistence.createConversation(newConv);
      }
    }
  }, [projectId, activeConversationId, convPersistence, makeNewConversation, mergedConversations]);

  // Hooks state (DB-backed)
  const projectHooks = useProjectHooks(projectId);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>(BUILTIN_MCP_SERVERS);
  const [activeRightPanel, setActiveRightPanel] = useState<'chat' | 'agent' | 'timeline' | 'protocol'>('chat');

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('light', next === 'light');
      return next;
    });
  }, []);

  // ─── Persistence: Load from CA snapshots first, fallback to DB, or seed demo ───
  useEffect(() => {
    if (persistenceLoading) return;

    if (projectId) {
      const projectInfo = projects.find(p => p.id === projectId);
      setProject(prev => ({ ...prev, id: projectId, name: projectInfo?.name || prev.name }));
    }

    // Try content-addressed snapshot checkout first
    let cancelled = false;
    (async () => {
      if (!projectId) return;
      const caFiles = await caSnapshots.checkoutMain();
      if (cancelled) return;

      if (caFiles && caFiles.length > 0) {
        setFiles(caFiles);
        const firstFile = caFiles.find(f => !f.isFolder);
        if (firstFile) {
          setOpenTabs([{ fileId: firstFile.id, name: firstFile.name, path: firstFile.path, isModified: false }]);
          setActiveTabId(firstFile.id);
        } else {
          setOpenTabs([]);
          setActiveTabId(null);
        }
        setFilesReady(true);
        return;
      }

      // Fallback to project_files table
      if (initialFiles && initialFiles.length > 0) {
        setFiles(initialFiles);
        // Seed the CA snapshot model with existing files
        caSnapshots.createCASnapshot(initialFiles, 'Initial migration from project_files');
        const firstFile = initialFiles.find(f => !f.isFolder);
        if (firstFile) {
          setOpenTabs([{ fileId: firstFile.id, name: firstFile.name, path: firstFile.path, isModified: false }]);
          setActiveTabId(firstFile.id);
        } else {
          setOpenTabs([]);
          setActiveTabId(null);
        }
      } else if (projectId && !initialFiles) {
        setFiles(DEMO_FILES);
        saveAllFiles(DEMO_FILES);
        caSnapshots.createCASnapshot(DEMO_FILES, 'Initial project setup');
        const firstFile = DEMO_FILES.find(f => !f.isFolder);
        if (firstFile) {
          setOpenTabs([{ fileId: firstFile.id, name: firstFile.name, path: firstFile.path, isModified: false }]);
          setActiveTabId(firstFile.id);
        } else {
          setOpenTabs([]);
          setActiveTabId(null);
        }
      }
      setFilesReady(true);
    })();

    return () => { cancelled = true; };
  }, [persistenceLoading, projectId, initialFiles, saveAllFiles, projects]);

  // ─── Auto-detect runtime from project files ───
  const prevRuntimeRef = useRef(project.runtimeType);
  useEffect(() => {
    if (!filesReady) return;
    const detected = detectRuntime(files);
    if (detected !== project.runtimeType) {
      const label = RUNTIME_TEMPLATES.find(t => t.type === detected)?.label || detected;
      setProject(prev => ({ ...prev, runtimeType: detected }));
      if (prevRuntimeRef.current !== detected) {
        toast({ title: `Runtime detected: ${label}` });
      }
    }
    prevRuntimeRef.current = detected;
  }, [files, filesReady]);

  const getFileById = useCallback((id: string) => files.find(f => f.id === id), [files]);

  const openFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file || file.isFolder) return;
    if (!openTabs.find(t => t.fileId === fileId)) {
      setOpenTabs(prev => [...prev, { fileId, name: file.name, path: file.path, isModified: false }]);
    }
    setActiveTabId(fileId);
  }, [files, openTabs]);

  const closeTab = useCallback((fileId: string) => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t.fileId !== fileId);
      if (activeTabId === fileId) {
        setActiveTabId(next.length > 0 ? next[next.length - 1].fileId : null);
      }
      return next;
    });
  }, [activeTabId]);

  const updateFileContent = useCallback((fileId: string, content: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file && !file.isFolder) {
        saveFile(file.path, content);
      }
      const updated = prev.map(f => f.id === fileId ? { ...f, content } : f);
      // Debounced sync to content-addressed snapshot
      caSnapshots.syncToSnapshot(updated);
      return updated;
    });
    setOpenTabs(prev => prev.map(t => t.fileId === fileId ? { ...t, isModified: true } : t));
  }, [saveFile, caSnapshots]);

  const createFile = useCallback((name: string, parentId: string | null, isFolder: boolean) => {
    const parent = parentId ? files.find(f => f.id === parentId) : null;
    const basePath = parent ? parent.path : '';
    const path = `${basePath}/${name}`;
    const ext = name.split('.').pop() || '';
    const newFile: IDEFile = {
      id: `f-${Date.now()}`, name, path, content: isFolder ? '' : '',
      language: LANG_MAP[ext] || 'plaintext', parentId, isFolder,
    };
    setFiles(prev => [...prev, newFile]);
    if (!isFolder) {
      openFile(newFile.id);
      saveFile(path, '');
    }
  }, [files, openFile, saveFile]);

  const deleteFile = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file && !file.isFolder) {
      deleteFileFromDB(file.path);
    }
    files.filter(f => f.parentId === fileId && !f.isFolder).forEach(f => deleteFileFromDB(f.path));
    setFiles(prev => prev.filter(f => f.id !== fileId && f.parentId !== fileId));
    closeTab(fileId);
  }, [closeTab, files, deleteFileFromDB]);

  const renameFile = useCallback((fileId: string, newName: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const parts = f.path.split('/');
        parts[parts.length - 1] = newName;
        return { ...f, name: newName, path: parts.join('/') };
      }
      return f;
    }));
    setOpenTabs(prev => prev.map(t => t.fileId === fileId ? { ...t, name: newName } : t));
  }, []);

  // ─── Tool Execution ───

  const executeAndUpdateTool = useCallback((call: ToolCall) => {
    setToolCalls(prev => prev.map(tc => tc.id === call.id ? { ...tc, status: 'running' as const } : tc));
    setTimeout(() => {
      const result = executeToolLocally(call, files);
      setToolCalls(prev => prev.map(tc =>
        tc.id === call.id
          ? { ...tc, status: result.ok ? 'completed' as const : 'failed' as const, result }
          : tc
      ));
    }, 300);
  }, [files]);

  const approveToolCall = useCallback((id: string) => {
    const call = toolCalls.find(tc => tc.id === id);
    if (!call) return;
    setToolCalls(prev => prev.map(tc => tc.id === id ? { ...tc, status: 'approved' as const } : tc));
    executeAndUpdateTool(call);
  }, [toolCalls, executeAndUpdateTool]);

  const denyToolCall = useCallback((id: string) => {
    setToolCalls(prev => prev.map(tc =>
      tc.id === id ? { ...tc, status: 'denied' as const, result: { ok: false, error: 'Permission denied by user' } } : tc
    ));
  }, []);

  const alwaysAllowTool = useCallback((toolName: ToolName) => {
    setPermissionPolicy(prev => ({
      ...prev, allowedTools: [...prev.allowedTools.filter(t => t !== toolName), toolName],
    }));
  }, []);

  const alwaysAllowCommand = useCallback((command: string) => {
    const prefix = command.split(' ').slice(0, 2).join(' ');
    setPermissionPolicy(prev => ({
      ...prev, allowedCommands: [...prev.allowedCommands.filter(c => c !== prefix), prefix],
    }));
  }, []);

  // ─── Consolidated Patch Application ───

  /**
   * Shared helper that applies parsed patches to the file system.
   * Uses filesRef.current to avoid stale closures.
   * Creates folders, new files, applies modifications, and persists to DB.
   */
  const autoApplyParsedPatches = useCallback((parsed: ParsedPatch[]): boolean => {
    let allApplied = true;

    for (const patch of parsed) {
      const isNewFile = patch.oldFile === '/dev/null';
      if (isNewFile) {
        const newContent = patch.hunks
          .flatMap(h => h.lines.filter(l => l.type === 'add').map(l => l.content))
          .join('\n');
        const filePath = patch.newFile.startsWith('/') ? patch.newFile : `/${patch.newFile}`;
        const fileName = filePath.split('/').pop() || filePath;
        const ext = fileName.split('.').pop() || '';

        // Ensure parent folders exist
        const parts = filePath.split('/').filter(Boolean);
        setFiles(prev => {
          const next = [...prev];
          for (let i = 1; i < parts.length; i++) {
            const folderPath = '/' + parts.slice(0, i).join('/');
            if (!next.find(f => f.path === folderPath && f.isFolder)) {
              const parentPath = i > 1 ? '/' + parts.slice(0, i - 1).join('/') : null;
              const parentId = parentPath ? next.find(f => f.path === parentPath)?.id || null : null;
              next.push({
                id: `folder-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 4)}`,
                name: parts[i - 1],
                path: folderPath,
                content: '',
                language: '',
                parentId,
                isFolder: true,
              });
            }
          }
          const parentPath = '/' + parts.slice(0, -1).join('/');
          const parentFile = next.find(f => f.path === parentPath);
          // Check if file already exists (overwrite)
          const existingIdx = next.findIndex(f => f.path === filePath && !f.isFolder);
          if (existingIdx >= 0) {
            next[existingIdx] = { ...next[existingIdx], content: newContent };
          } else {
            const newFile: IDEFile = {
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              name: fileName,
              path: filePath,
              content: newContent,
              language: LANG_MAP[ext] || 'plaintext',
              parentId: parentFile?.id || null,
              isFolder: false,
            };
            next.push(newFile);
            // Open in tab
            setOpenTabs(p => [...p, { fileId: newFile.id, name: newFile.name, path: newFile.path, isModified: false }]);
            setActiveTabId(newFile.id);
          }
          return next;
        });
        saveFile(filePath, newContent);
      } else {
        // Modify existing file — use functional update to get latest state
        const targetPath = patch.newFile.startsWith('/') ? patch.newFile : `/${patch.newFile}`;
        setFiles(prev => {
          const file = prev.find(f => f.path === targetPath);
          if (!file) { allApplied = false; return prev; }
          const newContent = applyPatchToContent(file.content, patch);
          if (newContent === null) { allApplied = false; return prev; }
          saveFile(targetPath, newContent);
          return prev.map(f => f.path === targetPath ? { ...f, content: newContent } : f);
        });
      }
    }

    return allApplied;
  }, [saveFile]);

  /**
   * Auto-create files from code blocks with file-path headers.
   */
  const autoCreateFileBlocks = useCallback((message: string) => {
    const blocks = extractFileBlocksFromMessage(message);
    if (blocks.length === 0) return;

    for (const block of blocks) {
      const filePath = block.path.startsWith('/') ? block.path : `/${block.path}`;
      const fileName = filePath.split('/').pop() || filePath;
      const ext = fileName.split('.').pop() || '';
      const parts = filePath.split('/').filter(Boolean);

      setFiles(prev => {
        // Don't create if file already exists
        if (prev.find(f => f.path === filePath && !f.isFolder)) return prev;

        const next = [...prev];
        // Ensure folders
        for (let i = 1; i < parts.length; i++) {
          const folderPath = '/' + parts.slice(0, i).join('/');
          if (!next.find(f => f.path === folderPath && f.isFolder)) {
            const parentPath = i > 1 ? '/' + parts.slice(0, i - 1).join('/') : null;
            const parentId = parentPath ? next.find(f => f.path === parentPath)?.id || null : null;
            next.push({
              id: `folder-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 4)}`,
              name: parts[i - 1], path: folderPath, content: '', language: '',
              parentId, isFolder: true,
            });
          }
        }
        const parentPath = '/' + parts.slice(0, -1).join('/');
        const parentFile = next.find(f => f.path === parentPath);
        const newFile: IDEFile = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: fileName, path: filePath, content: block.content,
          language: LANG_MAP[ext] || block.language || 'plaintext',
          parentId: parentFile?.id || null, isFolder: false,
        };
        next.push(newFile);
        setOpenTabs(p => [...p, { fileId: newFile.id, name: newFile.name, path: newFile.path, isModified: false }]);
        setActiveTabId(newFile.id);
        return next;
      });
      saveFile(filePath, block.content);
    }
  }, [saveFile]);

  // ─── Patch System (manual apply) ───

  const applyPatchToFiles = useCallback((patchId: string) => {
    const patchPreview = pendingPatches.find(p => p.id === patchId);
    if (!patchPreview) return false;
    try {
      const allApplied = autoApplyParsedPatches(patchPreview.patches);
      setPendingPatches(prev => prev.map(p =>
        p.id === patchId
          ? { ...p, status: allApplied ? 'applied' : 'failed', error: allApplied ? undefined : 'Some hunks could not be applied' }
          : p
      ));
      return allApplied;
    } catch (err) {
      setPendingPatches(prev => prev.map(p =>
        p.id === patchId ? { ...p, status: 'failed' as const, error: err instanceof Error ? err.message : 'Unknown error' } : p
      ));
      return false;
    }
  }, [pendingPatches, autoApplyParsedPatches]);

  const applyPatch = useCallback((patchId: string) => { applyPatchToFiles(patchId); }, [applyPatchToFiles]);

  const applyPatchAndRun = useCallback((patchId: string, command: string) => {
    const success = applyPatchToFiles(patchId);
    if (success) {
      setShowOutput(true);
      const run: RunResult = { id: `run-${Date.now()}`, command, status: 'running', logs: `$ ${command}\n`, timestamp: new Date() };
      setRuns(prev => [...prev, run]);
      runCommandRemote({
        command,
        cwd: runnerSession?.cwd || '/workspace',
        timeoutS: 600,
        onLog: (line) => { setRuns(prev => prev.map(r => r.id === run.id ? { ...r, logs: r.logs + line } : r)); },
        onDone: (result) => { setRuns(prev => prev.map(r => r.id === run.id ? { ...r, status: result.exitCode === 0 ? 'success' as const : 'error' as const, logs: r.logs + `\n${result.exitCode === 0 ? '✓' : '✗'} Exited ${result.exitCode}\n`, exitCode: result.exitCode, cwd: result.cwd, durationMs: result.durationMs } : r)); },
        onError: (error) => { setRuns(prev => prev.map(r => r.id === run.id ? { ...r, status: 'error' as const, logs: r.logs + `\n⚠ ${error}\n`, exitCode: 1 } : r)); },
      });
    }
  }, [applyPatchToFiles, runnerSession]);

  const cancelPatch = useCallback((patchId: string) => {
    setPendingPatches(prev => prev.map(p => p.id === patchId ? { ...p, status: 'cancelled' as const } : p));
  }, []);

  // ─── Messaging ───

  const sendMessage = useCallback((content: string, chips?: ChatMessage['contextChips']) => {
    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content, timestamp: new Date(), contextChips: chips };
    setChatMessages(prev => [...prev, userMsg]);

    const contextParts: string[] = [];
    const currentFiles = filesRef.current;
    const startedMd = currentFiles.find(f => f.path === '/STARTED.md');
    if (startedMd && startedMd.content.trim()) {
      contextParts.unshift(`[STARTED.md — Project Brief]\n${startedMd.content}`);
    }

    // ─── Inject project file tree (paths only, lightweight) ───
    const nonFolderFiles = currentFiles.filter(f => !f.isFolder);
    if (nonFolderFiles.length > 0) {
      const fileTree = nonFolderFiles.map(f => f.path).sort().join('\n');
      contextParts.push(`[Project Files]\n${fileTree}`);
    }

    // ─── Inject active file contents (truncated to avoid bloat) ───
    const activeFileObj = currentFiles.find(f => f.id === activeTabId && !f.isFolder);
    if (activeFileObj && activeFileObj.content) {
      const truncated = activeFileObj.content.length > 8000
        ? activeFileObj.content.slice(0, 8000) + '\n... (truncated)'
        : activeFileObj.content;
      contextParts.push(`[Active File: ${activeFileObj.path}]\n${truncated}`);
    }

    if (chips) {
      for (const chip of chips) {
        if (chip.type === 'selection') contextParts.push(`[Selected code]\n${chip.content}`);
        else if (chip.type === 'file') contextParts.push(`[File: ${chip.label}]\n${chip.content}`);
        else if (chip.type === 'errors') contextParts.push(`[Last run errors]\n${chip.content}`);
      }
    }
    const contextStr = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

    // Gather enabled MCP tools for AI context
    const enabledMcpTools = mcpServers
      .filter(s => s.enabled && s.authConfigured)
      .flatMap(s => s.tools.map(t => ({ server: s.name, name: t.name, description: t.description })));

    const apiMessages = chatMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    apiMessages.push({ role: 'user', content });

    const assistantMsgId = `msg-${Date.now() + 1}`;
    let assistantContent = '';
    setChatMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date() }]);

    streamChat({
      messages: apiMessages,
      context: contextStr,
      model: selectedModel,
      mcpTools: enabledMcpTools.length > 0 ? enabledMcpTools : undefined,
      onDelta: (chunk) => {
        assistantContent += chunk;
        setChatMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
        );
      },
      onDone: () => {
        // 1. Try diff blocks
        const diffRaw = extractDiffFromMessage(assistantContent);
        if (diffRaw) {
          const parsed = parseUnifiedDiff(diffRaw);
          if (parsed.length > 0) {
            const patchId = `patch-${Date.now()}`;
            const patchPreview: PatchPreview = { id: patchId, patches: parsed, raw: diffRaw, status: 'preview' };
            setPendingPatches(prev => [...prev, patchPreview]);

            // Auto-apply using consolidated helper
            const success = autoApplyParsedPatches(parsed);

            setPendingPatches(prev => prev.map(p =>
              p.id === patchId ? { ...p, status: success ? 'applied' : 'failed', error: success ? undefined : 'Some hunks could not be applied' } : p
            ));
          }
        }

        // 2. Try file blocks (```lang filepath)
        autoCreateFileBlocks(assistantContent);

        // 3. Generate AI title after first assistant reply
        if (activeConversationId && !titleGeneratedRef.current.has(activeConversationId)) {
          setChatMessages(prev => {
            const userMsgs = prev.filter(m => m.role === 'user');
            const assistantMsgs = prev.filter(m => m.role === 'assistant' && m.content.length > 0 && !m.content.startsWith("Hello! I'm Started"));
            if (userMsgs.length >= 1 && assistantMsgs.length >= 1) {
              titleGeneratedRef.current.add(activeConversationId);
              generateChatTitle(prev).then(title => {
                convPersistence.saveConversation(activeConversationId, prev, title);
                setLocalConversations(lc => lc.map(c =>
                  c.id === activeConversationId ? { ...c, title } : c
                ));
              });
            }
            return prev;
          });
        }
      },
      onError: (error) => {
        setChatMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: `⚠️ Error: ${error}` } : m)
        );
      },
    });
  }, [chatMessages, autoApplyParsedPatches, autoCreateFileBlocks, selectedModel, mcpServers]);

  // ─── Runner Session ───

  const ensureSession = useCallback(async (): Promise<RunnerSession> => {
    if (runnerSession && runnerSession.status === 'ready') return runnerSession;
    const client = runnerClientRef.current;
    const session = await client.createSession(project.id, project.runtimeType);
    setRunnerSession(session);
    return session;
  }, [runnerSession, project.id, project.runtimeType]);

  const killRunningProcess = useCallback(async () => {
    if (!runnerSession) return;
    await runnerClientRef.current.killProcess(runnerSession.id);
    setRunnerSession(prev => prev ? { ...prev, status: 'ready' } : null);
    setRuns(prev => prev.map(r =>
      r.status === 'running' ? { ...r, status: 'error' as const, logs: r.logs + '\n⚠ Process killed by user\n', exitCode: 137 } : r
    ));
  }, [runnerSession]);

  const runCommand = useCallback(async (command: string) => {
    setShowOutput(true);
    const run: RunResult = { id: `run-${Date.now()}`, command, status: 'running', logs: `$ ${command}\n`, timestamp: new Date() };
    setRuns(prev => [...prev, run]);

    // Determine if we need to send project files for this command
    const needsFiles = /^(npm|npx|node|deno|python|python3|pip|pip3|tsc|bun|bunx|go|cargo|rustc|gcc|g\+\+|javac|java|ruby|php|dart|swift|kotlin)\b/.test(command.trim());
    const filesToSend = needsFiles
      ? filesRef.current.filter(f => !f.isFolder).map(f => ({ path: f.path, content: f.content }))
      : undefined;

    runCommandRemote({
      command,
      cwd: runnerSession?.cwd || '/workspace',
      timeoutS: 600,
      projectId: project.id,
      files: filesToSend,
      onLog: (line) => {
        setRuns(prev => prev.map(r =>
          r.id === run.id ? { ...r, logs: r.logs + line } : r
        ));
      },
      onDone: (result) => {
        setRunnerSession(prev => prev ? { ...prev, cwd: result.cwd, status: 'ready' } : null);
        const runnerUnavailable = !!(result as any).runnerUnavailable;
        if (runnerUnavailable) setRunnerStatus('disconnected');
        setRuns(prev => prev.map(r =>
          r.id === run.id
            ? {
                ...r,
                status: result.exitCode === 0 ? 'success' as const : 'error' as const,
                logs: r.logs + `\n${result.exitCode === 0 ? '✓' : '✗'} Process exited with code ${result.exitCode}\n`,
                exitCode: result.exitCode, cwd: result.cwd, durationMs: result.durationMs,
                runnerUnavailable,
              }
            : r
        ));

        // Merge changed files back into IDE state
        if (result.changedFiles && result.changedFiles.length > 0) {
          for (const changed of result.changedFiles) {
            const existing = filesRef.current.find(f => f.path === changed.path);
            if (existing) {
              setFiles(prev => prev.map(f => f.path === changed.path ? { ...f, content: changed.content } : f));
              saveFile(changed.path, changed.content);
            } else {
              // New file created by runner
              const name = changed.path.split('/').pop() || changed.path;
              const ext = name.split('.').pop() || '';
              const parentPath = changed.path.split('/').slice(0, -1).join('/') || null;
              const parentId = parentPath ? `folder-${parentPath}` : null;
              const newFile: IDEFile = {
                id: `f-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
                name, path: changed.path, content: changed.content,
                language: LANG_MAP[ext] || 'plaintext', parentId, isFolder: false,
              };
              setFiles(prev => [...prev, newFile]);
              saveFile(changed.path, changed.content);
            }
          }
          toast({ title: `${result.changedFiles.length} file(s) updated by runner` });
        }

        // CI/CD: Auto-trigger event hooks
        if (result.exitCode === 0 && isDeployCommand(command)) {
          triggerEventHooks({
            projectId: project.id,
            event: 'OnDeploy',
            payload: { command, exitCode: result.exitCode, durationMs: result.durationMs, cwd: result.cwd },
          }).then(res => {
            if (res.hooks_triggered > 0) {
              toast({ title: `🚀 Deploy hooks fired (${res.hooks_triggered})` });
            }
          }).catch(() => {});
        }
        if (isErrorExit(result.exitCode)) {
          triggerEventHooks({
            projectId: project.id,
            event: 'OnError',
            payload: { command, exitCode: result.exitCode, durationMs: result.durationMs },
          }).catch(() => {});
        }
      },
      onError: (error) => {
        // Intercept Edge Runtime spawn error
        const isSpawnError = error.includes('Spawning subprocesses is not allowed') || error.includes('runner_unavailable');
        if (isSpawnError) {
          setRunnerStatus('disconnected');
        }
        setRuns(prev => prev.map(r =>
          r.id === run.id
            ? { ...r, status: 'error' as const, logs: r.logs + `\n⚠ Error: ${isSpawnError ? 'Runner execution unavailable. Connect a runner to execute commands.' : error}\n`, exitCode: 1, runnerUnavailable: isSpawnError }
            : r
        ));
        // Emit structured cards into chat
        if (isSpawnError) {
          const resultMsg: ChatMessage = {
            id: `msg-result-${Date.now()}`, role: 'assistant', content: '', timestamp: new Date(),
            cardType: 'result',
            resultData: { exitCode: 1, logs: '', errorSummary: 'Edge runtime cannot execute shell commands. Connect a runner node.', runnerUnavailable: true },
          };
          const suggestionMsg: ChatMessage = {
            id: `msg-suggest-${Date.now()}`, role: 'assistant', content: '', timestamp: new Date(),
            cardType: 'suggestion',
            suggestionData: {
              primary: { label: 'Connect Runner', action: 'connect_runner' },
              secondary: [{ label: 'View Docs', action: 'view_docs' }],
            },
          };
          setChatMessages(prev => [...prev, resultMsg, suggestionMsg]);
        }
        // Fire OnError hooks
        triggerEventHooks({
          projectId: project.id,
          event: 'OnError',
          payload: { command, error },
        }).catch(() => {});
      },
      onRequiresApproval: (req) => {
        // Pause the run and show permission prompt
        setRuns(prev => prev.map(r =>
          r.id === run.id
            ? { ...r, status: 'error' as const, logs: r.logs + `\n🛡 Permission required: ${req.reason}\n`, exitCode: -1 }
            : r
        ));
        setPendingPermission({ ...req, runId: run.id });
      },
    });
  }, [runnerSession, project.id, saveFile]);

  // ─── Permission Approval/Deny Handlers ───

  const approvePermission = useCallback(() => {
    if (!pendingPermission) return;
    setPendingPermission(null);
    // Re-run the command (server won't ask again for simple re-run; user can also add an allow rule)
    runCommand(pendingPermission.command);
  }, [pendingPermission, runCommand]);

  const denyPermission = useCallback(() => {
    if (!pendingPermission) return;
    setRuns(prev => prev.map(r =>
      r.id === pendingPermission.runId
        ? { ...r, logs: r.logs + '⛔ Command denied by user.\n' }
        : r
    ));
    setPendingPermission(null);
  }, [pendingPermission]);

  const alwaysAllowPermission = useCallback(async () => {
    if (!pendingPermission) return;
    // Persist an "allow" rule for this command prefix
    const cmdPrefix = pendingPermission.command.split(' ').slice(0, 2).join(' ');
    try {
      await supabase.from('project_permissions').insert({
        project_id: project.id,
        rule_type: 'command_prefix',
        subject: cmdPrefix,
        effect: 'allow',
        reason: 'Auto-allowed by user from permission prompt',
        created_by: user?.id || null,
      });
    } catch { /* best effort */ }
    // Also add to local policy
    setPermissionPolicy(prev => ({
      ...prev,
      allowedCommands: [...prev.allowedCommands, cmdPrefix],
    }));
    setPendingPermission(null);
    // Re-run the command
    runCommand(pendingPermission.command);
  }, [pendingPermission, project.id, user?.id, runCommand]);

  const sendErrorsToChat = useCallback(() => {
    const lastRun = runs[runs.length - 1];
    if (!lastRun) return;
    const errorChips: ContextChip[] = [{ type: 'errors', label: 'Last Run', content: lastRun.logs }];
    sendMessage('Here are the errors from my last run. Please analyze and fix them.', errorChips);
  }, [runs, sendMessage]);

  // ─── Agent Orchestrator ───

  const startAgent = useCallback((goal: string) => {
    agentAbortRef.current = false;
    const abortController = new AbortController();
    const run: AgentRun = {
      id: `agent-${Date.now()}`,
      goal,
      status: 'running',
      steps: [],
      iteration: 0,
      maxIterations: 10,
      startedAt: new Date(),
    };
    setAgentRun(run);
    setActiveRightPanel('agent');

    const addStep = (step: AgentStep) => {
      setAgentRun(prev => prev ? { ...prev, steps: [...prev.steps, step] } : null);
    };

    const projectFiles = filesRef.current
      .filter(f => !f.isFolder)
      .map(f => ({ path: f.path, content: f.content }));

    const presetKey = localStorage.getItem('default_agent_preset') || undefined;

    // Gather enabled MCP tools
    const enabledMcpTools = mcpServers
      .filter(s => s.enabled && s.authConfigured)
      .flatMap(s => s.tools.map(t => ({ server: s.name, name: t.name, description: t.description })));

    streamAgent({
      goal,
      files: projectFiles,
      maxIterations: 10,
      presetKey,
      model: selectedModel,
      mcpTools: enabledMcpTools.length > 0 ? enabledMcpTools : undefined,
      signal: abortController.signal,
      onRunStarted: (runId) => {
        agentServerRunIdRef.current = runId;
        localStorage.setItem('agent_active_run_id', runId);
        setAgentRun(prev => prev ? { ...prev, id: runId } : null);
      },
      onStep: (step, iteration) => {
        if (step.type === 'done') return;
        addStep({
          id: step.id,
          type: step.type as AgentStep['type'],
          label: step.label,
          detail: step.detail,
          status: step.status as AgentStep['status'],
          startedAt: new Date(),
          completedAt: step.status === 'completed' || step.status === 'failed' ? new Date() : undefined,
        });
        setAgentRun(prev => prev ? { ...prev, iteration } : null);
      },
      onPatch: (diff, summary) => {
        toast({ title: '📝 Patch applied', description: summary?.slice(0, 60) });
        const parsed = parseUnifiedDiff(diff);
        if (parsed.length > 0) {
          const patchId = `patch-${Date.now()}`;
          const patchPreview: PatchPreview = { id: patchId, patches: parsed, raw: diff, status: 'preview' };
          setPendingPatches(prev => [...prev, patchPreview]);

          // Apply using consolidated helper
          const success = autoApplyParsedPatches(parsed);

          // Track files changed and toast new files
          const filesChanged = parsed.map(patch => {
            const filePath = patch.newFile.startsWith('/') ? patch.newFile : `/${patch.newFile}`;
            const action: 'created' | 'modified' = patch.oldFile === '/dev/null' ? 'created' : 'modified';
            if (action === 'created') {
              toast({ title: `📄 Created: ${filePath}` });
            }
            return { path: filePath, action };
          });

          setAgentRun(prev => {
            if (!prev) return null;
            const steps = [...prev.steps];
            for (let i = steps.length - 1; i >= 0; i--) {
              if (steps[i].type === 'patch' && !steps[i].filesChanged) {
                steps[i] = { ...steps[i], filesChanged };
                break;
              }
            }
            return { ...prev, steps };
          });

          setPendingPatches(prev => prev.map(p =>
            p.id === patchId ? { ...p, status: success ? 'applied' : 'failed', error: success ? undefined : 'Some hunks failed' } : p
          ));
        }
      },
      onRunCommand: (command, summary) => {
        runCommand(command);
      },
      onDone: (reason) => {
        addStep({
          id: `step-done-${Date.now()}`,
          type: 'done',
          label: 'Goal completed',
          detail: reason,
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
        });
        setAgentRun(prev => prev ? { ...prev, status: 'completed', completedAt: new Date() } : null);
        localStorage.removeItem('agent_active_run_id');
        agentServerRunIdRef.current = null;
      },
      onMCPCall: (server, tool, input) => {
        addStep({
          id: `step-mcp-${Date.now()}`,
          type: 'mcp_call',
          label: `MCP: ${tool} (${server})`,
          detail: JSON.stringify(input).slice(0, 200),
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
        });
        toast({ title: `🔌 MCP Tool: ${tool}`, description: `Server: ${server}` });
      },
      onError: (reason) => {
        addStep({
          id: `step-err-${Date.now()}`,
          type: 'error',
          label: 'Agent error',
          detail: reason,
          status: 'failed',
          startedAt: new Date(),
          completedAt: new Date(),
        });
        setAgentRun(prev => prev ? { ...prev, status: 'failed', completedAt: new Date() } : null);
        localStorage.removeItem('agent_active_run_id');
        agentServerRunIdRef.current = null;
      },
    });

    (window as any).__agentAbortController = abortController;
  }, [runCommand, autoApplyParsedPatches, selectedModel, mcpServers]);

  const stopAgent = useCallback(() => {
    agentAbortRef.current = true;
    const ctrl = (window as any).__agentAbortController as AbortController | undefined;
    if (ctrl) ctrl.abort();
    // Cancel server-side too
    const serverRunId = agentServerRunIdRef.current;
    if (serverRunId) {
      cancelAgentRun(serverRunId).catch(() => {});
      localStorage.removeItem('agent_active_run_id');
      agentServerRunIdRef.current = null;
    }
    setAgentRun(prev => prev ? { ...prev, status: 'cancelled', completedAt: new Date() } : null);
  }, []);

  const pauseAgent = useCallback(() => {
    agentAbortRef.current = true;
    const ctrl = (window as any).__agentAbortController as AbortController | undefined;
    if (ctrl) ctrl.abort();
    // Cancel server-side too (pause = cancel on server, can resume later)
    const serverRunId = agentServerRunIdRef.current;
    if (serverRunId) {
      cancelAgentRun(serverRunId).catch(() => {});
    }
    setAgentRun(prev => prev ? { ...prev, status: 'paused' } : null);
  }, []);

  // ─── Agent Reconnection: poll for running agent on mount/refresh ───
  useEffect(() => {
    const savedRunId = localStorage.getItem('agent_active_run_id');
    if (!savedRunId || agentRun) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await getAgentRunStatus(savedRunId);
        if (cancelled) return;
        if (!status.run) {
          localStorage.removeItem('agent_active_run_id');
          return;
        }
        const steps: AgentStep[] = (status.steps || []).map(s => ({
          id: s.id,
          type: s.kind as AgentStep['type'],
          label: s.title,
          status: s.status === 'ok' ? 'completed' as const : s.status === 'error' ? 'failed' as const : 'completed' as const,
          durationMs: s.duration_ms ?? undefined,
          startedAt: new Date(),
          completedAt: new Date(),
        }));
        const isRunning = status.run.status === 'running';
        setAgentRun({
          id: savedRunId,
          goal: status.run.goal,
          status: isRunning ? 'running' : status.run.status === 'done' ? 'completed' : status.run.status === 'failed' ? 'failed' : 'completed',
          steps,
          iteration: status.run.current_step,
          maxIterations: status.run.max_steps,
          startedAt: new Date(status.run.created_at),
          completedAt: isRunning ? undefined : new Date(),
        });
        agentServerRunIdRef.current = savedRunId;
        setActiveRightPanel('agent');
        if (!isRunning) {
          localStorage.removeItem('agent_active_run_id');
        }
      } catch {
        localStorage.removeItem('agent_active_run_id');
      }
    };
    poll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Hooks (delegated to useProjectHooks) ───

  const { hooks, toggleHook, addHook, removeHook, webhookSecrets, executions: hookExecutions, generateSecret: generateWebhookSecret, deleteSecret: deleteWebhookSecret, loadExecutions: refreshHookExecutions } = projectHooks;

  const toggleMCPServer = useCallback((id: string) => {
    setMcpServers(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, []);

  // ─── Snapshots ───

  const createSnapshot = useCallback((label?: string) => {
    // Create both legacy and CA snapshots
    createSnapshotRaw(files, label);
    caSnapshots.createCASnapshot(files, label || `Snapshot ${new Date().toLocaleString()}`);
  }, [files, createSnapshotRaw, caSnapshots]);

  const restoreSnapshot = useCallback(async (snapshotId: string) => {
    // Try CA checkout first
    const caFiles = await caSnapshots.checkoutSnapshot(snapshotId);
    if (caFiles && caFiles.length > 0) {
      setFiles(caFiles);
      saveAllFiles(caFiles);
      const firstFile = caFiles.find(f => !f.isFolder);
      if (firstFile) {
        setOpenTabs([{ fileId: firstFile.id, name: firstFile.name, path: firstFile.path, isModified: false }]);
        setActiveTabId(firstFile.id);
      } else {
        setOpenTabs([]);
        setActiveTabId(null);
      }
      return;
    }

    // Fallback to legacy file_snapshots
    const snapshotFiles = await getSnapshotFiles(snapshotId);
    if (!snapshotFiles) return;

    const { buildIDEFilesFromRows } = await import('@/hooks/use-project-persistence');
    const ideFiles = buildIDEFilesFromRows(snapshotFiles);
    setFiles(ideFiles);
    saveAllFiles(ideFiles);

    const firstFile = ideFiles.find(f => !f.isFolder);
    if (firstFile) {
      setOpenTabs([{ fileId: firstFile.id, name: firstFile.name, path: firstFile.path, isModified: false }]);
      setActiveTabId(firstFile.id);
    } else {
      setOpenTabs([]);
      setActiveTabId(null);
    }
  }, [caSnapshots, getSnapshotFiles, saveAllFiles]);

  // ─── Project Switching ───

  const switchProject = useCallback(async (targetProjectId: string) => {
    await switchProjectRaw(targetProjectId);
  }, [switchProjectRaw]);

  const createProject = useCallback(async (name: string) => {
    const result = await createProjectRaw(name);
    if ('error' in result) {
      toast({ title: 'Cannot create project', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: `Project created: ${name}` });
      await switchProjectRaw(result.id);
    }
  }, [createProjectRaw, switchProjectRaw]);

  const renameProjectAction = useCallback(async (pid: string, name: string) => {
    await renameProjectRaw(pid, name);
    if (pid === projectId) {
      setProject(prev => ({ ...prev, name }));
    }
  }, [renameProjectRaw, projectId]);

  const deleteProjectAction = useCallback(async (pid: string) => {
    const success = await deleteProjectRaw(pid);
    if (success) {
      const remaining = projects.filter(p => p.id !== pid);
      if (remaining.length > 0) {
        await switchProjectRaw(remaining[0].id);
      }
    }
  }, [deleteProjectRaw, projects, switchProjectRaw]);

  // ─── Onboarding goal: auto-send first message if set ───
  const onboardingGoalSent = useRef(false);
  useEffect(() => {
    if (onboardingGoalSent.current || persistenceLoading || !filesReady) return;
    const goal = sessionStorage.getItem('started_onboarding_goal');
    if (goal) {
      onboardingGoalSent.current = true;
      sessionStorage.removeItem('started_onboarding_goal');
      // Small delay to let the UI render first
      setTimeout(() => sendMessage(goal), 500);
    }
  }, [persistenceLoading, filesReady, sendMessage]);

  if (persistenceLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="text-2xl font-mono text-muted-foreground animate-pulse">Loading project...</div>
        </div>
      </div>
    );
  }

  return (
    <IDEContext.Provider value={{
      project, setRuntimeType: (rt: RuntimeType) => setProject(p => ({ ...p, runtimeType: rt })),
      files, openTabs, activeTabId, chatMessages, runs,
      showOutput, showChat, selectedText, setSelectedText,
      openFile, closeTab, setActiveTab: setActiveTabId,
      updateFileContent, createFile, deleteFile, renameFile,
      sendMessage, runCommand,
      toggleOutput: () => setShowOutput(p => !p),
      toggleChat: () => setShowChat(p => !p),
      getFileById,
      toolCalls, pendingPatches, permissionPolicy,
      approveToolCall, denyToolCall, alwaysAllowTool, alwaysAllowCommand,
      applyPatch, applyPatchAndRun, cancelPatch,
      runnerSession, killRunningProcess,
      sendErrorsToChat,
      theme, toggleTheme,
      agentRun, startAgent, stopAgent, pauseAgent, clearAgentRun: () => setAgentRun(null),
      hooks, toggleHook, addHook, removeHook,
      webhookSecrets, hookExecutions, generateWebhookSecret, deleteWebhookSecret, refreshHookExecutions,
      mcpServers, toggleMCPServer,
      activeRightPanel, setActiveRightPanel,
      snapshots, snapshotsLoading, loadSnapshots, createSnapshot, restoreSnapshot,
      conversations: mergedConversations,
      activeConversationId, switchConversation, newConversation, deleteConversation,
      projects, switchProject, createProject, renameProject: renameProjectAction, deleteProject: deleteProjectAction,
      collaborators: collab.collaborators,
      collabMessages: collab.messages,
      fileLocks: collab.fileLocks,
      presenceUsers: collab.presenceUsers,
      collabLoading: collab.loading,
      inviteCollaborator: collab.inviteCollaborator,
      removeCollaborator: collab.removeCollaborator,
      sendCollabMessage: collab.sendCollabMessage,
      lockFile: collab.lockFile,
      unlockFile: collab.unlockFile,
      isFileLocked: collab.isFileLocked,
      isFileLockedByMe: collab.isFileLockedByMe,
      trackActiveFile: collab.trackActiveFile,
      isProjectOwner,
      pendingPermission,
      approvePermission,
      denyPermission,
      alwaysAllowPermission,
      selectedModel, setSelectedModel,
      runnerStatus,
    }}>
      {children}
    </IDEContext.Provider>
  );
}

export const useIDE = () => {
  const ctx = useContext(IDEContext);
  if (!ctx) throw new Error('useIDE must be used within IDEProvider');
  return ctx;
};

// ─── Hooks Evaluator ───

function evaluateHooks(event: 'PreToolUse' | 'PostToolUse', call: ToolCall, hooks: Hook[]): 'allow' | 'deny' | 'pass' {
  for (const hook of hooks.filter(h => h.enabled && h.event === event)) {
    const toolMatch = hook.toolPattern === '*' || hook.toolPattern === call.tool;
    if (!toolMatch) continue;

    if (hook.commandPattern && call.tool === 'run_command') {
      const cmd = (call.input as { command: string }).command;
      if (new RegExp(hook.commandPattern).test(cmd)) {
        if (hook.action === 'deny') return 'deny';
        if (hook.action === 'allow') return 'allow';
      }
    } else if (!hook.commandPattern && toolMatch) {
      if (hook.action === 'deny') return 'deny';
      if (hook.action === 'allow') return 'allow';
    }
  }
  return 'pass';
}

// ─── Mock Generators ───

function generateMockToolCalls(userMessage: string): ToolCall[] {
  const lc = userMessage.toLowerCase();
  const calls: ToolCall[] = [];
  if (lc.includes('refactor') || lc.includes('improve') || lc.includes('fix')) {
    calls.push({ id: `tc-${Date.now()}-read`, tool: 'read_file', input: { path: '/src/utils.ts' }, status: 'pending', timestamp: new Date() });
  }
  if (lc.includes('test')) {
    calls.push({ id: `tc-${Date.now()}-grep`, tool: 'grep', input: { pattern: 'export function', paths_glob: 'src/**/*.ts' }, status: 'pending', timestamp: new Date() });
    calls.push({ id: `tc-${Date.now()}-run`, tool: 'run_command', input: { command: 'npm test', cwd: '.', timeout_s: 60 }, status: 'pending', timestamp: new Date() });
  }
  if (lc.includes('search') || lc.includes('find')) {
    calls.push({ id: `tc-${Date.now()}-list`, tool: 'list_files', input: { glob: 'src/**/*' }, status: 'pending', timestamp: new Date() });
  }
  return calls;
}

function generateMockResponse(userMessage: string, context: string): string {
  const lc = userMessage.toLowerCase();
  if (lc.includes('test')) {
    return `**Plan:**\n- Add unit tests for \`greet\` and \`add\` functions\n- Use Jest as the testing framework\n- Cover edge cases and boundary conditions\n\n\`\`\`diff\n--- /dev/null\n+++ src/utils.test.ts\n@@ -0,0 +1,19 @@\n+import { greet, add } from './utils';\n+\n+describe('greet', () => {\n+  it('should greet with name', () => {\n+    expect(greet('Started')).toBe('Hello, Started! Welcome to Started.');\n+  });\n+});\n+\n+describe('add', () => {\n+  it('should add two numbers', () => {\n+    expect(add(2, 3)).toBe(5);\n+  });\n+\n+  it('should handle negative numbers', () => {\n+    expect(add(-1, 1)).toBe(0);\n+  });\n+});\n\`\`\`\n\n\`\`\`\nnpm test\n\`\`\``;
  }
  if (lc.includes('fix') || lc.includes('bug') || lc.includes('error')) {
    return `**Plan:**\n- Inspect the reported issue${context ? ' with provided context' : ''}\n- Identify root cause\n- Apply minimal fix\n\nI'd need to see the specific error output. Attach \`@errors:lastRun\` or paste the stack trace so I can generate a precise patch.`;
  }
  if (lc.includes('refactor') || lc.includes('improve') || lc.includes('clean')) {
    return `**Plan:**\n- Review current implementation${context ? '\n- Analyze provided context' : ''}\n- Extract reusable helpers\n- Improve type safety\n\n\`\`\`diff\n--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -1,4 +1,8 @@\n+/** Generates a greeting message for the given name. */\n export function greet(name: string): string {\n+  if (!name?.trim()) {\n+    throw new Error('Name must be a non-empty string');\n+  }\n   return \`Hello, \${name}! Welcome to Started.\`;\n }\n\`\`\`\n\n\`\`\`\nnpm test\n\`\`\`\n\n**Notes:** Added input validation and JSDoc. Run tests to verify nothing breaks.`;
  }
  return `**Plan:**\n- Analyze request${context ? ' with provided context' : ''}\n- Identify relevant files\n- Propose minimal changes\n\nI've reviewed your request. Here's what I suggest:\n\n1. The current code structure looks solid\n2. I can help with specific changes — try selecting code and using \`@selection\`, or attach a file with \`@file\`\n3. For bug fixes, attach \`@errors\` from the last run\n\nWhat specific change would you like me to make?`;
}

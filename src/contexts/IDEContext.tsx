import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { IDEFile, OpenTab, ChatMessage, RunResult, Project } from '@/types/ide';
import { ToolCall, ToolName, PatchPreview, PermissionPolicy, DEFAULT_PERMISSION_POLICY } from '@/types/tools';
import { RunnerSession } from '@/types/runner';
import { CLAUDE_SYSTEM_PROMPT } from '@/lib/claude-prompt';
import { evaluatePermission, executeToolLocally } from '@/lib/tool-executor';
import { getRunnerClient, IRunnerClient } from '@/lib/runner-client';
import { parseUnifiedDiff, applyPatchToContent, extractDiffFromMessage, extractCommandsFromMessage } from '@/lib/patch-utils';

const DEMO_FILES: IDEFile[] = [
  {
    id: 'root-src', name: 'src', path: '/src', content: '', language: '',
    parentId: null, isFolder: true,
  },
  {
    id: 'f-main', name: 'main.ts', path: '/src/main.ts',
    content: `import { greet } from './utils';\n\nconst name = process.argv[2] || 'World';\nconsole.log(greet(name));\nconsole.log('Claude Code Cloud IDE is running!');\n`,
    language: 'typescript', parentId: 'root-src', isFolder: false,
  },
  {
    id: 'f-utils', name: 'utils.ts', path: '/src/utils.ts',
    content: `export function greet(name: string): string {\n  return \`Hello, \${name}! Welcome to Claude Code.\`;\n}\n\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`,
    language: 'typescript', parentId: 'root-src', isFolder: false,
  },
  {
    id: 'f-readme', name: 'README.md', path: '/README.md',
    content: `# Demo Project\n\nA simple TypeScript project to demonstrate the Claude Code Cloud IDE.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\n## Features\n\n- TypeScript support\n- Claude AI assistance\n- Live preview\n`,
    language: 'markdown', parentId: null, isFolder: false,
  },
  {
    id: 'f-pkg', name: 'package.json', path: '/package.json',
    content: `{\n  "name": "demo-project",\n  "version": "1.0.0",\n  "main": "src/main.ts",\n  "scripts": {\n    "start": "ts-node src/main.ts",\n    "test": "jest"\n  }\n}\n`,
    language: 'json', parentId: null, isFolder: false,
  },
  {
    id: 'f-tsconfig', name: 'tsconfig.json', path: '/tsconfig.json',
    content: `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "commonjs",\n    "strict": true,\n    "outDir": "./dist"\n  },\n  "include": ["src/**/*"]\n}\n`,
    language: 'json', parentId: null, isFolder: false,
  },
];

interface IDEContextType {
  project: Project;
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
  // Tool system
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
  // Runner session
  runnerSession: RunnerSession | null;
  killRunningProcess: () => void;
}

const IDEContext = createContext<IDEContextType | null>(null);

export function IDEProvider({ children }: { children: React.ReactNode }) {
  const [project] = useState<Project>({
    id: 'demo-1',
    name: 'demo-project',
    runtimeType: 'node',
    files: [],
  });

  const runnerClientRef = useRef<IRunnerClient>(getRunnerClient());
  const [runnerSession, setRunnerSession] = useState<RunnerSession | null>(null);

  const [files, setFiles] = useState<IDEFile[]>(DEMO_FILES);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([
    { fileId: 'f-main', name: 'main.ts', path: '/src/main.ts', isModified: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string | null>('f-main');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm Claude, your AI coding assistant. I can help you write, debug, and refactor code. Select some code or mention a file to get started.\n\nTry asking me to:\n- Explain a function\n- Add error handling\n- Write tests\n- Refactor code",
      timestamp: new Date(),
    },
  ]);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [showOutput, setShowOutput] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [selectedText, setSelectedText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [pendingPatches, setPendingPatches] = useState<PatchPreview[]>([]);
  const [permissionPolicy, setPermissionPolicy] = useState<PermissionPolicy>(DEFAULT_PERMISSION_POLICY);

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
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content } : f));
    setOpenTabs(prev => prev.map(t => t.fileId === fileId ? { ...t, isModified: true } : t));
  }, []);

  const createFile = useCallback((name: string, parentId: string | null, isFolder: boolean) => {
    const parent = parentId ? files.find(f => f.id === parentId) : null;
    const basePath = parent ? parent.path : '';
    const path = `${basePath}/${name}`;
    const ext = name.split('.').pop() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
      jsx: 'javascriptreact', json: 'json', md: 'markdown',
      py: 'python', css: 'css', html: 'html',
    };
    const newFile: IDEFile = {
      id: `f-${Date.now()}`,
      name, path,
      content: isFolder ? '' : '',
      language: langMap[ext] || 'plaintext',
      parentId, isFolder,
    };
    setFiles(prev => [...prev, newFile]);
    if (!isFolder) openFile(newFile.id);
  }, [files, openFile]);

  const deleteFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId && f.parentId !== fileId));
    closeTab(fileId);
  }, [closeTab]);

  const renameFile = useCallback((fileId: string, newName: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const parts = f.path.split('/');
        parts[parts.length - 1] = newName;
        return { ...f, name: newName, path: parts.join('/') };
      }
      return f;
    }));
    setOpenTabs(prev => prev.map(t => {
      if (t.fileId === fileId) return { ...t, name: newName };
      return t;
    }));
  }, []);

  // ─── Tool Execution ───

  const executeAndUpdateTool = useCallback((call: ToolCall) => {
    setToolCalls(prev => prev.map(tc => tc.id === call.id ? { ...tc, status: 'running' as const } : tc));

    // Use setTimeout to simulate async execution
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
      ...prev,
      allowedTools: [...prev.allowedTools.filter(t => t !== toolName), toolName],
    }));
  }, []);

  const alwaysAllowCommand = useCallback((command: string) => {
    const prefix = command.split(' ').slice(0, 2).join(' ');
    setPermissionPolicy(prev => ({
      ...prev,
      allowedCommands: [...prev.allowedCommands.filter(c => c !== prefix), prefix],
    }));
  }, []);

  // ─── Patch System ───

  const applyPatchToFiles = useCallback((patchId: string) => {
    const patchPreview = pendingPatches.find(p => p.id === patchId);
    if (!patchPreview) return false;

    try {
      let allApplied = true;
      for (const patch of patchPreview.patches) {
        const isNewFile = patch.oldFile === '/dev/null';

        if (isNewFile) {
          // Create new file from patch
          const newContent = patch.hunks
            .flatMap(h => h.lines.filter(l => l.type === 'add').map(l => l.content))
            .join('\n');

          const name = patch.newFile.split('/').pop() || patch.newFile;
          const path = patch.newFile.startsWith('/') ? patch.newFile : `/${patch.newFile}`;
          const ext = name.split('.').pop() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
            jsx: 'javascriptreact', json: 'json', md: 'markdown',
            py: 'python', css: 'css', html: 'html',
          };

          // Determine parent folder
          const parentPath = path.split('/').slice(0, -1).join('/') || '/';
          const parent = files.find(f => f.path === parentPath && f.isFolder);

          const newFile: IDEFile = {
            id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name, path, content: newContent,
            language: langMap[ext] || 'plaintext',
            parentId: parent?.id || null,
            isFolder: false,
          };
          setFiles(prev => [...prev, newFile]);
          // Open the new file
          setOpenTabs(prev => [...prev, { fileId: newFile.id, name: newFile.name, path: newFile.path, isModified: false }]);
          setActiveTabId(newFile.id);
        } else {
          // Apply to existing file
          const targetPath = patch.newFile.startsWith('/') ? patch.newFile : `/${patch.newFile}`;
          const file = files.find(f => f.path === targetPath);
          if (!file) {
            allApplied = false;
            continue;
          }
          const newContent = applyPatchToContent(file.content, patch);
          if (newContent === null) {
            allApplied = false;
            continue;
          }
          setFiles(prev => prev.map(f => f.path === targetPath ? { ...f, content: newContent } : f));
        }
      }

      setPendingPatches(prev => prev.map(p =>
        p.id === patchId
          ? { ...p, status: allApplied ? 'applied' : 'failed', error: allApplied ? undefined : 'Some hunks could not be applied' }
          : p
      ));
      return allApplied;
    } catch (err) {
      setPendingPatches(prev => prev.map(p =>
        p.id === patchId
          ? { ...p, status: 'failed' as const, error: err instanceof Error ? err.message : 'Unknown error' }
          : p
      ));
      return false;
    }
  }, [pendingPatches, files]);

  const applyPatch = useCallback((patchId: string) => {
    applyPatchToFiles(patchId);
  }, [applyPatchToFiles]);

  const applyPatchAndRun = useCallback((patchId: string, command: string) => {
    const success = applyPatchToFiles(patchId);
    if (success) {
      // Run the command after applying
      setShowOutput(true);
      const run: RunResult = {
        id: `run-${Date.now()}`,
        command,
        status: 'running',
        logs: `$ ${command}\n`,
        timestamp: new Date(),
      };
      setRuns(prev => [...prev, run]);

      setTimeout(() => {
        setRuns(prev => prev.map(r =>
          r.id === run.id
            ? {
                ...r,
                status: 'success' as const,
                logs: r.logs + `\n> Running after patch applied...\n\n✓ Process exited with code 0\n`,
                exitCode: 0,
              }
            : r
        ));
      }, 1500);
    }
  }, [applyPatchToFiles]);

  const cancelPatch = useCallback((patchId: string) => {
    setPendingPatches(prev => prev.map(p =>
      p.id === patchId ? { ...p, status: 'cancelled' as const } : p
    ));
  }, []);

  // ─── Messaging ───

  const sendMessage = useCallback((content: string, chips?: ChatMessage['contextChips']) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      contextChips: chips,
    };
    setChatMessages(prev => [...prev, userMsg]);

    const contextParts: string[] = [];
    if (chips) {
      for (const chip of chips) {
        if (chip.type === 'selection') contextParts.push(`[Selected code]\n${chip.content}`);
        else if (chip.type === 'file') contextParts.push(`[File: ${chip.label}]\n${chip.content}`);
        else if (chip.type === 'errors') contextParts.push(`[Last run errors]\n${chip.content}`);
      }
    }
    const contextBlock = contextParts.length > 0 ? `\n\nContext provided:\n${contextParts.join('\n\n')}` : '';

    // TODO: Replace with real API call to POST /api/claude
    setTimeout(() => {
      const response = generateMockResponse(content, contextBlock);

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, assistantMsg]);

      // Extract and process tool calls from mock response
      const mockToolCalls = generateMockToolCalls(content);
      if (mockToolCalls.length > 0) {
        setToolCalls(prev => [...prev, ...mockToolCalls]);
        // Auto-execute allowed tools
        for (const tc of mockToolCalls) {
          const decision = evaluatePermission(tc, permissionPolicy);
          if (decision === 'allow') {
            setTimeout(() => executeAndUpdateTool(tc), 100);
          } else if (decision === 'deny') {
            setToolCalls(prev => prev.map(t =>
              t.id === tc.id ? { ...t, status: 'denied' as const, result: { ok: false, error: 'Blocked by permission policy' } } : t
            ));
          }
          // 'ask' tools remain pending for user approval
        }
      }

      // Extract diff patches from response
      const diffRaw = extractDiffFromMessage(response);
      if (diffRaw) {
        const parsed = parseUnifiedDiff(diffRaw);
        if (parsed.length > 0) {
          const commands = extractCommandsFromMessage(response);
          const patchPreview: PatchPreview = {
            id: `patch-${Date.now()}`,
            patches: parsed,
            raw: diffRaw,
            status: 'preview',
          };
          setPendingPatches(prev => [...prev, patchPreview]);
        }
      }
    }, 800);
  }, [files, project.id, permissionPolicy, executeAndUpdateTool]);

  // ─── Runner Session Management ───

  const ensureSession = useCallback(async (): Promise<RunnerSession> => {
    if (runnerSession && runnerSession.status === 'ready') return runnerSession;
    const client = runnerClientRef.current;
    const session = await client.createSession(project.id, project.runtimeType);
    // Sync workspace files into the session
    await client.syncWorkspace(session.id, files.filter(f => !f.isFolder));
    setRunnerSession(session);
    return session;
  }, [runnerSession, project.id, project.runtimeType, files]);

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
    const run: RunResult = {
      id: `run-${Date.now()}`,
      command,
      status: 'running',
      logs: `$ ${command}\n`,
      timestamp: new Date(),
    };
    setRuns(prev => [...prev, run]);

    try {
      const session = await ensureSession();
      const result = await runnerClientRef.current.exec(session.id, {
        command,
        timeoutS: 600,
      });

      setRunnerSession(prev => prev ? { ...prev, cwd: result.cwd, status: 'ready' } : null);

      setRuns(prev => prev.map(r =>
        r.id === run.id
          ? {
              ...r,
              status: result.ok ? 'success' as const : 'error' as const,
              logs: r.logs + (result.stdout || '') + (result.stderr ? `\nSTDERR:\n${result.stderr}` : '') + `\n\n${result.ok ? '✓' : '✗'} Process exited with code ${result.exitCode}\n`,
              exitCode: result.exitCode,
              cwd: result.cwd,
              durationMs: result.durationMs,
              sessionId: session.id,
            }
          : r
      ));
    } catch (err) {
      setRuns(prev => prev.map(r =>
        r.id === run.id
          ? {
              ...r,
              status: 'error' as const,
              logs: r.logs + `\n⚠ Runner error: ${err instanceof Error ? err.message : 'Unknown error'}\n`,
              exitCode: 1,
            }
          : r
      ));
    }
  }, [ensureSession]);

  return (
    <IDEContext.Provider value={{
      project, files, openTabs, activeTabId, chatMessages, runs,
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

// ─── Mock Generators ───

function generateMockToolCalls(userMessage: string): ToolCall[] {
  const lc = userMessage.toLowerCase();
  const calls: ToolCall[] = [];

  // Simulate Claude reading files before making suggestions
  if (lc.includes('refactor') || lc.includes('improve') || lc.includes('fix')) {
    calls.push({
      id: `tc-${Date.now()}-read`,
      tool: 'read_file',
      input: { path: '/src/utils.ts' },
      status: 'pending',
      timestamp: new Date(),
    });
  }

  if (lc.includes('test')) {
    calls.push({
      id: `tc-${Date.now()}-grep`,
      tool: 'grep',
      input: { pattern: 'export function', paths_glob: 'src/**/*.ts' },
      status: 'pending',
      timestamp: new Date(),
    });
    calls.push({
      id: `tc-${Date.now()}-run`,
      tool: 'run_command',
      input: { command: 'npm test', cwd: '.', timeout_s: 60 },
      status: 'pending',
      timestamp: new Date(),
    });
  }

  if (lc.includes('search') || lc.includes('find')) {
    calls.push({
      id: `tc-${Date.now()}-list`,
      tool: 'list_files',
      input: { glob: 'src/**/*' },
      status: 'pending',
      timestamp: new Date(),
    });
  }

  return calls;
}

function generateMockResponse(userMessage: string, context: string): string {
  const lc = userMessage.toLowerCase();

  if (lc.includes('test')) {
    return `**Plan:**
- Add unit tests for \`greet\` and \`add\` functions
- Use Jest as the testing framework
- Cover edge cases and boundary conditions

\`\`\`diff
--- /dev/null
+++ src/utils.test.ts
@@ -0,0 +1,19 @@
+import { greet, add } from './utils';
+
+describe('greet', () => {
+  it('should greet with name', () => {
+    expect(greet('Claude')).toBe('Hello, Claude! Welcome to Claude Code.');
+  });
+});
+
+describe('add', () => {
+  it('should add two numbers', () => {
+    expect(add(2, 3)).toBe(5);
+  });
+
+  it('should handle negative numbers', () => {
+    expect(add(-1, 1)).toBe(0);
+  });
+});
\`\`\`

\`\`\`
npm test
\`\`\``;
  }

  if (lc.includes('fix') || lc.includes('bug') || lc.includes('error')) {
    return `**Plan:**
- Inspect the reported issue${context ? ' with provided context' : ''}
- Identify root cause
- Apply minimal fix

I'd need to see the specific error output. Attach \`@errors:lastRun\` or paste the stack trace so I can generate a precise patch.`;
  }

  if (lc.includes('refactor') || lc.includes('improve') || lc.includes('clean')) {
    return `**Plan:**
- Review current implementation${context ? '\n- Analyze provided context' : ''}
- Extract reusable helpers
- Improve type safety
- Reduce duplication

\`\`\`diff
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,4 +1,8 @@
+/** Generates a greeting message for the given name. */
 export function greet(name: string): string {
+  if (!name?.trim()) {
+    throw new Error('Name must be a non-empty string');
+  }
   return \`Hello, \${name}! Welcome to Claude Code.\`;
 }
\`\`\`

\`\`\`
npm test
\`\`\`

**Notes:** Added input validation and JSDoc. Run tests to verify nothing breaks.`;
  }

  return `**Plan:**
- Analyze request${context ? ' with provided context' : ''}
- Identify relevant files
- Propose minimal changes

I've reviewed your request. Here's what I suggest:

1. The current code structure looks solid
2. I can help with specific changes — try selecting code and using \`@selection\`, or attach a file with \`@file\`
3. For bug fixes, attach \`@errors\` from the last run

What specific change would you like me to make?`;
}

import React, { createContext, useContext, useState, useCallback } from 'react';
import { IDEFile, OpenTab, ChatMessage, RunResult, Project } from '@/types/ide';
import { CLAUDE_SYSTEM_PROMPT } from '@/lib/claude-prompt';

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
}

const IDEContext = createContext<IDEContextType | null>(null);

export function IDEProvider({ children }: { children: React.ReactNode }) {
  const [project] = useState<Project>({
    id: 'demo-1',
    name: 'demo-project',
    runtimeType: 'node',
    files: [],
  });

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

  const sendMessage = useCallback((content: string, chips?: ChatMessage['contextChips']) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      contextChips: chips,
    };
    setChatMessages(prev => [...prev, userMsg]);

    // Build context block from chips
    const contextParts: string[] = [];
    if (chips) {
      for (const chip of chips) {
        if (chip.type === 'selection') {
          contextParts.push(`[Selected code]\n${chip.content}`);
        } else if (chip.type === 'file') {
          contextParts.push(`[File: ${chip.label}]\n${chip.content}`);
        } else if (chip.type === 'errors') {
          contextParts.push(`[Last run errors]\n${chip.content}`);
        }
      }
    }

    const contextBlock = contextParts.length > 0
      ? `\n\nContext provided:\n${contextParts.join('\n\n')}`
      : '';

    // TODO: Replace with real API call to POST /api/claude
    // The request body should be:
    // {
    //   project_id: project.id,
    //   chat_id: 'default',
    //   user_message: content + contextBlock,
    //   context: { chips, files: files.map(f => ({ path: f.path, content: f.content })) },
    //   system_prompt: CLAUDE_SYSTEM_PROMPT
    // }
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: generateMockResponse(content, contextBlock),
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    }, 800);
  }, [files, project.id]);

  const runCommand = useCallback((command: string) => {
    setShowOutput(true);
    const run: RunResult = {
      id: `run-${Date.now()}`,
      command,
      status: 'running',
      logs: `$ ${command}\n`,
      timestamp: new Date(),
    };
    setRuns(prev => [...prev, run]);

    // Mock run execution
    setTimeout(() => {
      setRuns(prev => prev.map(r =>
        r.id === run.id
          ? {
              ...r,
              status: 'success' as const,
              logs: r.logs + `\n> demo-project@1.0.0 start\n> ts-node src/main.ts\n\nHello, World! Welcome to Claude Code.\nClaude Code Cloud IDE is running!\n\n✓ Process exited with code 0\n`,
              exitCode: 0,
            }
          : r
      ));
    }, 1500);
  }, []);

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

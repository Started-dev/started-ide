import { useRef, useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X, Circle } from 'lucide-react';
import { useIDE } from '@/contexts/IDEContext';

export function EditorPane() {
  const { openTabs, activeTabId, setActiveTab, closeTab, getFileById, updateFileContent, setSelectedText, theme } = useIDE();
  const editorRef = useRef<any>(null);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('editor_font_size')) || 14);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'editor_font_size' && e.newValue) setFontSize(Number(e.newValue));
    };
    const onCustom = (e: Event) => {
      setFontSize((e as CustomEvent).detail);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('editor_font_size_change', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('editor_font_size_change', onCustom);
    };
  }, []);

  const activeFile = activeTabId ? getFileById(activeTabId) : null;

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getModel()?.getValueInRange(editor.getSelection());
      setSelectedText(selection || '');
    });
  };

  if (openTabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-ide-panel">
        <div className="text-center space-y-3">
          <div className="text-4xl font-mono text-muted-foreground/30">{'{ }'}</div>
          <p className="text-sm text-muted-foreground">Open a file to start editing</p>
          <p className="text-xs text-muted-foreground/60">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">⌘K</kbd> to open command palette
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ide-panel">
      {/* Tab bar */}
      <div className="flex items-center bg-ide-tab-inactive border-b border-border overflow-x-auto">
        {openTabs.map(tab => (
          <div
            key={tab.fileId}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border transition-colors min-w-0 ${
              activeTabId === tab.fileId
                ? 'bg-ide-tab-active text-foreground border-t-2 border-t-primary'
                : 'text-muted-foreground hover:bg-ide-tab-hover'
            }`}
            onClick={() => setActiveTab(tab.fileId)}
          >
            {tab.isModified && (
              <Circle className="h-2 w-2 fill-primary text-primary shrink-0" />
            )}
            <span className="truncate">{tab.name}</span>
            <button
              className="ml-1 p-0.5 rounded-sm hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={e => { e.stopPropagation(); closeTab(tab.fileId); }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 relative z-50">
        {activeFile && (
          <Editor
            key={activeFile.id}
            defaultValue={activeFile.content}
            language={activeFile.language}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onChange={value => updateFileContent(activeFile.id, value || '')}
            onMount={handleEditorMount}
            options={{
              fontSize,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              bracketPairColorization: { enabled: true },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              tabSize: 2,
            }}
          />
        )}
      </div>
    </div>
  );
}

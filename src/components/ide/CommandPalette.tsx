import { useState, useEffect, useRef } from 'react';
import {
  FilePlus, FolderPlus, Play, Search, MessageSquare,
  PanelLeftClose, PanelRightClose, Command,
} from 'lucide-react';
import { useIDE } from '@/contexts/IDEContext';

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { createFile, runCommand, toggleChat, toggleOutput, files, openFile } = useIDE();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands: CommandItem[] = [
    { id: 'new-file', label: 'New File', shortcut: '⌘N', icon: <FilePlus className="h-4 w-4" />, action: () => { createFile('untitled.ts', null, false); setOpen(false); } },
    { id: 'new-folder', label: 'New Folder', icon: <FolderPlus className="h-4 w-4" />, action: () => { createFile('new-folder', null, true); setOpen(false); } },
    { id: 'run', label: 'Run Command', shortcut: '⌘⏎', icon: <Play className="h-4 w-4" />, action: () => { runCommand('npm start'); setOpen(false); } },
    { id: 'toggle-chat', label: 'Toggle Chat Panel', shortcut: '⌘B', icon: <MessageSquare className="h-4 w-4" />, action: () => { toggleChat(); setOpen(false); } },
    { id: 'toggle-output', label: 'Toggle Output Panel', shortcut: '⌘J', icon: <PanelRightClose className="h-4 w-4" />, action: () => { toggleOutput(); setOpen(false); } },
  ];

  // Add file search results
  const fileCommands: CommandItem[] = files
    .filter(f => !f.isFolder)
    .map(f => ({
      id: `file-${f.id}`,
      label: f.path,
      icon: <Search className="h-4 w-4" />,
      action: () => { openFile(f.id); setOpen(false); },
    }));

  const allCommands = [...commands, ...fileCommands];
  const filtered = query
    ? allCommands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selectedIndex]?.action();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Command className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search files..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-[300px] overflow-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No results found</p>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors ${
                  i === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="text-muted-foreground">{cmd.icon}</span>
                <span className="flex-1">{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] text-muted-foreground">{cmd.shortcut}</kbd>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

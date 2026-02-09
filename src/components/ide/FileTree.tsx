import { useState } from 'react';
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  Plus, FilePlus, FolderPlus, Trash2, Pencil,
} from 'lucide-react';
import { useIDE } from '@/contexts/IDEContext';
import { IDEFile } from '@/types/ide';

export function FileTree() {
  const { files, openFile, activeTabId, createFile, deleteFile, renameFile } = useIDE();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root-src']));
  const [showNewInput, setShowNewInput] = useState<{ parentId: string | null; isFolder: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCreate = () => {
    if (newName.trim() && showNewInput) {
      createFile(newName.trim(), showNewInput.parentId, showNewInput.isFolder);
      setNewName('');
      setShowNewInput(null);
    }
  };

  const handleRename = (fileId: string) => {
    if (renameValue.trim()) {
      renameFile(fileId, renameValue.trim());
      setRenamingId(null);
    }
  };

  const rootFiles = files.filter(f => f.parentId === null);
  const getChildren = (parentId: string) => files.filter(f => f.parentId === parentId);

  const renderFile = (file: IDEFile, depth: number) => {
    const isExpanded = expandedFolders.has(file.id);
    const isActive = activeTabId === file.id;
    const children = file.isFolder ? getChildren(file.id) : [];

    return (
      <div key={file.id}>
        <div
          className={`group flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-accent/50 transition-colors ${
            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => file.isFolder ? toggleFolder(file.id) : openFile(file.id)}
        >
          {file.isFolder ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-ide-warning" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-ide-warning" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5" />
              <File className="h-3.5 w-3.5 shrink-0 text-ide-info" />
            </>
          )}

          {renamingId === file.id ? (
            <input
              className="flex-1 bg-input text-foreground text-xs px-1 py-0.5 rounded-sm border border-primary outline-none"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => handleRename(file.id)}
              onKeyDown={e => e.key === 'Enter' ? handleRename(file.id) : e.key === 'Escape' && setRenamingId(null)}
              autoFocus
            />
          ) : (
            <span className="flex-1 truncate text-xs">{file.name}</span>
          )}

          <div className="hidden group-hover:flex items-center gap-0.5">
            {file.isFolder && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setShowNewInput({ parentId: file.id, isFolder: false }); }}
                  className="p-0.5 hover:bg-muted rounded-sm"
                >
                  <FilePlus className="h-3 w-3" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setShowNewInput({ parentId: file.id, isFolder: true }); }}
                  className="p-0.5 hover:bg-muted rounded-sm"
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
              </>
            )}
            <button
              onClick={e => { e.stopPropagation(); setRenamingId(file.id); setRenameValue(file.name); }}
              className="p-0.5 hover:bg-muted rounded-sm"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); deleteFile(file.id); }}
              className="p-0.5 hover:bg-muted rounded-sm text-ide-error"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {file.isFolder && isExpanded && (
          <>
            {showNewInput?.parentId === file.id && (
              <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
                {showNewInput.isFolder ? <Folder className="h-3.5 w-3.5 text-ide-warning" /> : <File className="h-3.5 w-3.5 text-ide-info" />}
                <input
                  className="flex-1 bg-input text-foreground text-xs px-1 py-0.5 rounded-sm border border-primary outline-none"
                  placeholder={showNewInput.isFolder ? 'Folder name...' : 'File name...'}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onBlur={handleCreate}
                  onKeyDown={e => e.key === 'Enter' ? handleCreate() : e.key === 'Escape' && setShowNewInput(null)}
                  autoFocus
                />
              </div>
            )}
            {[...children].sort((a, b) => {
              if (a.isFolder && !b.isFolder) return -1;
              if (!a.isFolder && b.isFolder) return 1;
              return a.name.localeCompare(b.name);
            }).map(child => renderFile(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground">Explorer</span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowNewInput({ parentId: null, isFolder: false })}
            className="p-1 hover:bg-sidebar-accent rounded-sm text-sidebar-foreground"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowNewInput({ parentId: null, isFolder: true })}
            className="p-1 hover:bg-sidebar-accent rounded-sm text-sidebar-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {showNewInput?.parentId === null && (
          <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: '8px' }}>
            {showNewInput.isFolder ? <Folder className="h-3.5 w-3.5 text-ide-warning" /> : <File className="h-3.5 w-3.5 text-ide-info" />}
            <input
              className="flex-1 bg-input text-foreground text-xs px-1 py-0.5 rounded-sm border border-primary outline-none"
              placeholder={showNewInput.isFolder ? 'Folder name...' : 'File name...'}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onBlur={handleCreate}
              onKeyDown={e => e.key === 'Enter' ? handleCreate() : e.key === 'Escape' && setShowNewInput(null)}
              autoFocus
            />
          </div>
        )}
        {[...rootFiles].sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        }).map(file => renderFile(file, 0))}
      </div>
    </div>
  );
}

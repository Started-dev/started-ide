import { useState } from 'react';
import { X, FolderOpen, Plus, Trash2, Pencil, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ProjectInfo } from '@/hooks/use-project-persistence';

interface ProjectSwitcherProps {
  projects: ProjectInfo[];
  currentProjectId: string | null;
  onSwitch: (projectId: string) => void;
  onCreate: (name: string) => Promise<void> | void;
  onRename: (projectId: string, name: string) => void;
  onDelete: (projectId: string) => void;
  onClose: () => void;
}

export function ProjectSwitcher({
  projects,
  currentProjectId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onClose,
}: ProjectSwitcherProps) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectInfo | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await onCreate(name);
      setNewName('');
    } finally {
      setCreating(false);
    }
  };

  const startRename = (p: ProjectInfo) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-sm bg-popover border border-border rounded-lg shadow-2xl overflow-hidden animate-fade-in"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Projects</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded-sm">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Create new */}
          <div className="px-4 py-3 border-b border-border">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">
              New project
            </label>
            <div className="flex gap-1.5">
              <Input
                placeholder="Project name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="h-7 text-xs bg-background"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="h-7 text-xs px-2.5 gap-1"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-[350px] overflow-auto p-2 space-y-1">
            {projects.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                No projects yet.
              </div>
            )}

            {projects.map(p => {
              const isCurrent = p.id === currentProjectId;
              const isEditing = editingId === p.id;

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md transition-colors ${
                    isCurrent
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:bg-accent/30 cursor-pointer'
                  }`}
                  onClick={() => !isCurrent && !isEditing && onSwitch(p.id)}
                >
                  <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="h-5 text-xs bg-background px-1"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                          onClick={e => e.stopPropagation()}
                        />
                        <button onClick={e => { e.stopPropagation(); commitRename(); }} className="p-0.5 hover:bg-muted rounded-sm">
                          <Check className="h-3 w-3 text-ide-success" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                          {p.name}
                          {isCurrent && (
                            <span className="text-[9px] px-1 py-0.5 bg-primary/10 text-primary rounded-sm">active</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{formatDate(p.created_at)}</div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); startRename(p); }}
                        className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {!isCurrent && (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(p); }}
                          className="p-1 rounded-sm transition-colors hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Delete project"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              Switch between projects or create new ones. Each project has its own files and snapshots.
            </p>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Are you sure you want to delete <strong className="text-foreground">{deleteTarget?.name}</strong>?
              </span>
              <span className="block text-destructive font-medium">
                This will permanently delete all project files, snapshots, run history, and collaboration data. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

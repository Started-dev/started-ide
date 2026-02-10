import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { IDEFile } from '@/types/ide';
import type { User } from '@supabase/supabase-js';

const SAVE_DEBOUNCE_MS = 1500;

interface PersistenceState {
  projectId: string | null;
  loading: boolean;
  initialFiles: IDEFile[] | null;
}

/**
 * Handles loading/saving project files from the database.
 * Returns initial files once loaded, and a `saveFile` function for persisting edits.
 */
export function useProjectPersistence(user: User | null) {
  const [state, setState] = useState<PersistenceState>({
    projectId: null,
    loading: true,
    initialFiles: null,
  });
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const projectIdRef = useRef<string | null>(null);

  // Load or create project + files on login
  useEffect(() => {
    if (!user) {
      setState({ projectId: null, loading: false, initialFiles: null });
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        // 1. Find existing project or create one
        const { data: projects, error: projErr } = await supabase
          .from('projects')
          .select('id, name')
          .eq('owner_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (projErr) throw projErr;

        let projectId: string;

        if (projects && projects.length > 0) {
          projectId = projects[0].id;
        } else {
          const { data: newProj, error: createErr } = await supabase
            .from('projects')
            .insert({ owner_id: user!.id, name: 'demo-project' })
            .select('id')
            .single();
          if (createErr || !newProj) throw createErr || new Error('Failed to create project');
          projectId = newProj.id;
        }

        // 2. Load files
        const { data: dbFiles, error: filesErr } = await supabase
          .from('project_files')
          .select('path, content')
          .eq('project_id', projectId);

        if (filesErr) throw filesErr;

        if (cancelled) return;

        projectIdRef.current = projectId;

        if (dbFiles && dbFiles.length > 0) {
          // Convert DB rows to IDEFile[]
          const ideFiles = buildIDEFilesFromRows(dbFiles);
          setState({ projectId, loading: false, initialFiles: ideFiles });
        } else {
          // No files yet — signal to use defaults (null means use demo files)
          setState({ projectId, loading: false, initialFiles: null });
        }
      } catch (err) {
        console.error('Project persistence init error:', err);
        if (!cancelled) {
          setState({ projectId: null, loading: false, initialFiles: null });
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [user]);

  // Save a single file (debounced)
  const saveFile = useCallback((path: string, content: string) => {
    const pid = projectIdRef.current;
    if (!pid) return;

    if (saveTimers.current[path]) {
      clearTimeout(saveTimers.current[path]);
    }

    saveTimers.current[path] = setTimeout(async () => {
      try {
        await supabase
          .from('project_files')
          .upsert(
            { project_id: pid, path, content, updated_at: new Date().toISOString() },
            { onConflict: 'project_id,path' }
          );
      } catch (err) {
        console.error('Failed to save file:', path, err);
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Delete a file from DB
  const deleteFileFromDB = useCallback(async (path: string) => {
    const pid = projectIdRef.current;
    if (!pid) return;
    try {
      await supabase
        .from('project_files')
        .delete()
        .eq('project_id', pid)
        .eq('path', path);
    } catch (err) {
      console.error('Failed to delete file:', path, err);
    }
  }, []);

  // Save all files at once (for initial seed)
  const saveAllFiles = useCallback(async (files: IDEFile[]) => {
    const pid = projectIdRef.current;
    if (!pid) return;
    const nonFolders = files.filter(f => !f.isFolder);
    const rows = nonFolders.map(f => ({
      project_id: pid,
      path: f.path,
      content: f.content,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return;
    try {
      await supabase
        .from('project_files')
        .upsert(rows, { onConflict: 'project_id,path' });
    } catch (err) {
      console.error('Failed to save all files:', err);
    }
  }, []);

  return {
    projectId: state.projectId,
    loading: state.loading,
    initialFiles: state.initialFiles,
    saveFile,
    deleteFileFromDB,
    saveAllFiles,
  };
}

/** Convert flat DB rows [{path, content}] into IDEFile[] with folder structure */
export function buildIDEFilesFromRows(rows: { path: string; content: string }[]): IDEFile[] {
  const files: IDEFile[] = [];
  const folderPaths = new Set<string>();

  // Collect all needed folder paths
  for (const row of rows) {
    const parts = row.path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add('/' + parts.slice(0, i).join('/'));
    }
  }

  // Create folder entries
  for (const fp of folderPaths) {
    const name = fp.split('/').pop() || fp;
    const parentPath = fp.split('/').slice(0, -1).join('/') || null;
    const parentId = parentPath ? `folder-${parentPath}` : null;
    files.push({
      id: `folder-${fp}`,
      name,
      path: fp,
      content: '',
      language: '',
      parentId,
      isFolder: true,
    });
  }

  // Create file entries
  const extLangMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript',
    jsx: 'javascriptreact', json: 'json', md: 'markdown',
    py: 'python', css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml',
    sh: 'shell', toml: 'toml',
  };

  for (const row of rows) {
    const name = row.path.split('/').pop() || row.path;
    const ext = name.split('.').pop() || '';
    const parentPath = row.path.split('/').slice(0, -1).join('/') || null;
    const parentId = parentPath ? `folder-${parentPath}` : null;
    files.push({
      id: `file-${row.path}`,
      name,
      path: row.path,
      content: row.content,
      language: extLangMap[ext] || 'plaintext',
      parentId,
      isFolder: false,
    });
  }

  return files;
}

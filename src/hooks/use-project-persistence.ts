import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { IDEFile } from '@/types/ide';
import type { User } from '@supabase/supabase-js';

const SAVE_DEBOUNCE_MS = 1500;

export interface ProjectInfo {
  id: string;
  name: string;
  created_at: string;
}

interface PersistenceState {
  projectId: string | null;
  loading: boolean;
  initialFiles: IDEFile[] | null;
  projects: ProjectInfo[];
}

/**
 * Handles loading/saving project files from the database.
 * Supports listing, switching, and creating projects.
 */
export function useProjectPersistence(user: User | null) {
  const [state, setState] = useState<PersistenceState>({
    projectId: null,
    loading: true,
    initialFiles: null,
    projects: [],
  });
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const projectIdRef = useRef<string | null>(null);

  // Load projects list + most recent project files on login
  useEffect(() => {
    if (!user) {
      setState({ projectId: null, loading: false, initialFiles: null, projects: [] });
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        // 1. List all projects
        const { data: allProjects, error: projErr } = await supabase
          .from('projects')
          .select('id, name, created_at')
          .eq('owner_id', user!.id)
          .order('created_at', { ascending: false });

        if (projErr) throw projErr;

        const projectsList: ProjectInfo[] = (allProjects || []).map(p => ({
          id: p.id,
          name: p.name,
          created_at: p.created_at,
        }));

        let projectId: string;

        if (projectsList.length > 0) {
          projectId = projectsList[0].id;
        } else {
          const { data: newProj, error: createErr } = await supabase
            .from('projects')
            .insert({ owner_id: user!.id, name: 'demo-project' })
            .select('id, name, created_at')
            .single();
          if (createErr || !newProj) throw createErr || new Error('Failed to create project');
          projectId = newProj.id;
          projectsList.unshift({ id: newProj.id, name: newProj.name, created_at: newProj.created_at });
        }

        // 2. Load files for this project
        const { data: dbFiles, error: filesErr } = await supabase
          .from('project_files')
          .select('path, content')
          .eq('project_id', projectId);

        if (filesErr) throw filesErr;
        if (cancelled) return;

        projectIdRef.current = projectId;

        if (dbFiles && dbFiles.length > 0) {
          const ideFiles = buildIDEFilesFromRows(dbFiles);
          setState({ projectId, loading: false, initialFiles: ideFiles, projects: projectsList });
        } else {
          setState({ projectId, loading: false, initialFiles: null, projects: projectsList });
        }
      } catch (err) {
        console.error('Project persistence init error:', err);
        if (!cancelled) {
          setState({ projectId: null, loading: false, initialFiles: null, projects: [] });
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [user]);

  // Switch to a different project
  const switchProject = useCallback(async (targetProjectId: string) => {
    setState(prev => ({ ...prev, loading: true }));
    projectIdRef.current = targetProjectId;

    try {
      const { data: dbFiles, error: filesErr } = await supabase
        .from('project_files')
        .select('path, content')
        .eq('project_id', targetProjectId);

      if (filesErr) throw filesErr;

      if (dbFiles && dbFiles.length > 0) {
        const ideFiles = buildIDEFilesFromRows(dbFiles);
        setState(prev => ({ ...prev, projectId: targetProjectId, loading: false, initialFiles: ideFiles }));
      } else {
        setState(prev => ({ ...prev, projectId: targetProjectId, loading: false, initialFiles: null }));
      }
    } catch (err) {
      console.error('Failed to switch project:', err);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  // Create a new project (enforces max_projects quota)
  const createProject = useCallback(async (name: string): Promise<string | null> => {
    if (!user) return null;
    try {
      // Check plan quota
      const { data: ledger } = await supabase
        .from('api_usage_ledger')
        .select('plan_key')
        .eq('owner_id', user.id)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      const planKey = ledger?.plan_key || 'free';
      const { data: plan } = await supabase
        .from('billing_plans')
        .select('max_projects')
        .eq('key', planKey)
        .maybeSingle();

      const maxProjects = plan?.max_projects || 2;
      if (state.projects.length >= maxProjects) {
        console.error(`Project limit reached (${maxProjects} for ${planKey} plan). Upgrade to create more.`);
        return null;
      }

      const { data: newProj, error } = await supabase
        .from('projects')
        .insert({ owner_id: user.id, name })
        .select('id, name, created_at')
        .single();

      if (error || !newProj) throw error || new Error('Failed to create project');

      const newInfo: ProjectInfo = { id: newProj.id, name: newProj.name, created_at: newProj.created_at };
      setState(prev => ({ ...prev, projects: [newInfo, ...prev.projects] }));
      return newProj.id;
    } catch (err) {
      console.error('Failed to create project:', err);
      return null;
    }
  }, [user, state.projects.length]);

  // Rename a project
  const renameProject = useCallback(async (projectIdToRename: string, newName: string) => {
    try {
      await supabase.from('projects').update({ name: newName }).eq('id', projectIdToRename);
      setState(prev => ({
        ...prev,
        projects: prev.projects.map(p => p.id === projectIdToRename ? { ...p, name: newName } : p),
      }));
    } catch (err) {
      console.error('Failed to rename project:', err);
    }
  }, []);

  // Delete a project
  const deleteProject = useCallback(async (projectIdToDelete: string) => {
    try {
      await supabase.from('projects').delete().eq('id', projectIdToDelete);
      setState(prev => ({
        ...prev,
        projects: prev.projects.filter(p => p.id !== projectIdToDelete),
      }));
      return true;
    } catch (err) {
      console.error('Failed to delete project:', err);
      return false;
    }
  }, []);

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
    projects: state.projects,
    saveFile,
    deleteFileFromDB,
    saveAllFiles,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
  };
}

/** Convert flat DB rows [{path, content}] into IDEFile[] with folder structure */
export function buildIDEFilesFromRows(rows: { path: string; content: string }[]): IDEFile[] {
  const files: IDEFile[] = [];
  const folderPaths = new Set<string>();

  for (const row of rows) {
    const parts = row.path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add('/' + parts.slice(0, i).join('/'));
    }
  }

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

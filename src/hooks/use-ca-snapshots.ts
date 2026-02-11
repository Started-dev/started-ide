import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { IDEFile } from '@/types/ide';
import { buildIDEFilesFromRows } from '@/hooks/use-project-persistence';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SNAPSHOT_DEBOUNCE_MS = 3000;

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

async function callSnapshotAPI(action: string, body: Record<string, unknown>) {
  const token = await getAuthToken();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/snapshot-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

/**
 * Hook that provides content-addressed snapshot operations.
 * Wraps the snapshot-api edge function.
 */
export function useCASnapshots(projectId: string | null) {
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotHash = useRef<string | null>(null);

  /** Checkout files from the "main" ref (or a specific snapshot/ref). */
  const checkoutMain = useCallback(async (): Promise<IDEFile[] | null> => {
    if (!projectId) return null;
    try {
      const result = await callSnapshotAPI('checkout', { project_id: projectId, ref_name: 'main' });
      if (!result.ok || !result.files || result.files.length === 0) return null;
      return buildIDEFilesFromRows(result.files);
    } catch (err) {
      console.warn('CA checkout failed (will fall back to project_files):', err);
      return null;
    }
  }, [projectId]);

  /** Create a new snapshot from the current file state, updating the "main" ref. */
  const createCASnapshot = useCallback(async (files: IDEFile[], label?: string) => {
    if (!projectId) return;
    const nonFolders = files.filter(f => !f.isFolder);
    const flatFiles = nonFolders.map(f => ({ path: f.path, content: f.content }));
    try {
      const result = await callSnapshotAPI('create_snapshot', {
        project_id: projectId,
        files: flatFiles,
        label: label || 'Auto-snapshot',
        ref_name: 'main',
      });
      if (result.root_tree_hash) {
        lastSnapshotHash.current = result.root_tree_hash;
      }
      return result;
    } catch (err) {
      console.error('CA snapshot creation failed:', err);
    }
  }, [projectId]);

  /** Debounced snapshot sync — call this on file changes. */
  const syncToSnapshot = useCallback((files: IDEFile[]) => {
    if (!projectId) return;
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(() => {
      createCASnapshot(files, 'Auto-sync');
    }, SNAPSHOT_DEBOUNCE_MS);
  }, [projectId, createCASnapshot]);

  /** Checkout a specific snapshot by ID. */
  const checkoutSnapshot = useCallback(async (snapshotId: string): Promise<IDEFile[] | null> => {
    try {
      const result = await callSnapshotAPI('checkout', { snapshot_id: snapshotId });
      if (!result.ok || !result.files) return null;
      return buildIDEFilesFromRows(result.files);
    } catch (err) {
      console.error('CA checkout snapshot failed:', err);
      return null;
    }
  }, []);

  /** Diff two snapshots. */
  const diffSnapshots = useCallback(async (oldId: string, newId: string) => {
    try {
      const result = await callSnapshotAPI('diff', { old_snapshot_id: oldId, new_snapshot_id: newId });
      return result.diff || null;
    } catch (err) {
      console.error('CA diff failed:', err);
      return null;
    }
  }, []);

  /** List refs for the project. */
  const listRefs = useCallback(async () => {
    if (!projectId) return [];
    try {
      const result = await callSnapshotAPI('list_refs', { project_id: projectId });
      return result.refs || [];
    } catch {
      return [];
    }
  }, [projectId]);

  return {
    checkoutMain,
    createCASnapshot,
    syncToSnapshot,
    checkoutSnapshot,
    diffSnapshots,
    listRefs,
  };
}

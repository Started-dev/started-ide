import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { IDEFile } from '@/types/ide';
import type { Json } from '@/integrations/supabase/types';

export interface Snapshot {
  id: string;
  label: string;
  created_at: string;
  fileCount: number;
}

interface FileRow {
  path: string;
  content: string;
}

export function useFileSnapshots(projectId: string | null) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSnapshots = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('file_snapshots')
        .select('id, label, created_at, files_json')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSnapshots(
        (data || []).map(s => ({
          id: s.id,
          label: s.label,
          created_at: s.created_at,
          fileCount: Array.isArray(s.files_json) ? s.files_json.length : 0,
        }))
      );
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    }
    setLoading(false);
  }, [projectId]);

  const createSnapshot = useCallback(async (files: IDEFile[], label?: string) => {
    if (!projectId) return;
    const nonFolders = files.filter(f => !f.isFolder);
    const filesJson: FileRow[] = nonFolders.map(f => ({ path: f.path, content: f.content }));
    const snapshotLabel = label || `Snapshot ${new Date().toLocaleString()}`;

    try {
      const { error } = await supabase
        .from('file_snapshots')
        .insert({
          project_id: projectId,
          label: snapshotLabel,
          files_json: filesJson as unknown as Json,
        });

      if (error) throw error;
      await loadSnapshots();
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    }
  }, [projectId, loadSnapshots]);

  const getSnapshotFiles = useCallback(async (snapshotId: string): Promise<FileRow[] | null> => {
    try {
      const { data, error } = await supabase
        .from('file_snapshots')
        .select('files_json')
        .eq('id', snapshotId)
        .single();

      if (error) throw error;
      return (data.files_json as unknown as FileRow[]) || null;
    } catch (err) {
      console.error('Failed to load snapshot files:', err);
      return null;
    }
  }, []);

  return {
    snapshots,
    loading,
    loadSnapshots,
    createSnapshot,
    getSnapshotFiles,
  };
}

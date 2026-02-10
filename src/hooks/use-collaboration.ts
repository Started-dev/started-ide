import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Collaborator {
  id: string;
  user_id: string;
  email: string;
  role: 'viewer' | 'editor';
  accepted: boolean;
}

export interface CollabMessage {
  id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
}

export interface FileLock {
  id: string;
  file_path: string;
  locked_by: string;
  locked_by_email: string;
  locked_at: string;
}

export interface PresenceUser {
  userId: string;
  email: string;
  activeFile?: string;
  color: string;
  lastSeen: Date;
}

const PRESENCE_COLORS = [
  'hsl(142 71% 45%)', 'hsl(217 91% 60%)', 'hsl(280 65% 60%)',
  'hsl(350 80% 55%)', 'hsl(30 90% 55%)', 'hsl(180 60% 45%)',
];

export function useCollaboration(projectId: string | null, userId: string | null, userEmail: string | null) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [messages, setMessages] = useState<CollabMessage[]>([]);
  const [fileLocks, setFileLocks] = useState<FileLock[]>([]);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load initial data
  useEffect(() => {
    if (!projectId || !userId) return;

    const loadData = async () => {
      setLoading(true);
      const [collabRes, msgRes, lockRes] = await Promise.all([
        supabase.from('project_collaborators').select('*').eq('project_id', projectId),
        supabase.from('collab_messages').select('*').eq('project_id', projectId).order('created_at', { ascending: true }).limit(100),
        supabase.from('file_locks').select('*').eq('project_id', projectId),
      ]);
      if (collabRes.data) setCollaborators(collabRes.data as any);
      if (msgRes.data) setMessages(msgRes.data as any);
      if (lockRes.data) setFileLocks(lockRes.data as any);
      setLoading(false);
    };
    loadData();
  }, [projectId, userId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!projectId || !userId || !userEmail) return;

    // Presence channel
    const channel = supabase.channel(`project:${projectId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        let colorIdx = 0;
        Object.entries(state).forEach(([key, presences]) => {
          const p = (presences as any[])[0];
          if (key !== userId) {
            users.push({
              userId: key,
              email: p?.email || 'unknown',
              activeFile: p?.activeFile,
              color: PRESENCE_COLORS[colorIdx % PRESENCE_COLORS.length],
              lastSeen: new Date(),
            });
            colorIdx++;
          }
        });
        setPresenceUsers(users);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collab_messages', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessages(prev => [...prev, payload.new as any]);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'file_locks', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setFileLocks(prev => [...prev, payload.new as any]);
        } else if (payload.eventType === 'DELETE') {
          setFileLocks(prev => prev.filter(l => l.id !== (payload.old as any).id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_collaborators', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setCollaborators(prev => [...prev, payload.new as any]);
        } else if (payload.eventType === 'DELETE') {
          setCollaborators(prev => prev.filter(c => c.id !== (payload.old as any).id));
        } else if (payload.eventType === 'UPDATE') {
          setCollaborators(prev => prev.map(c => c.id === (payload.new as any).id ? payload.new as any : c));
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ email: userEmail, activeFile: null });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, userId, userEmail]);

  // Track active file for presence
  const trackActiveFile = useCallback(async (filePath: string | null) => {
    if (!channelRef.current || !userEmail) return;
    await channelRef.current.track({ email: userEmail, activeFile: filePath });
  }, [userEmail]);

  // Invite collaborator
  const inviteCollaborator = useCallback(async (email: string, role: 'viewer' | 'editor') => {
    if (!projectId || !userId) return;
    // Look up user by email in auth — we'll use the email directly
    // The invited user needs to accept when they log in
    const { data: existingUsers } = await supabase.from('project_collaborators').select('id').eq('project_id', projectId).eq('email', email);
    if (existingUsers && existingUsers.length > 0) return; // Already invited

    await supabase.from('project_collaborators').insert({
      project_id: projectId,
      user_id: userId, // Temporary — will be updated when they accept
      email,
      role,
      invited_by: userId,
      accepted: false,
    });
  }, [projectId, userId]);

  const removeCollaborator = useCallback(async (collaboratorId: string) => {
    await supabase.from('project_collaborators').delete().eq('id', collaboratorId);
    setCollaborators(prev => prev.filter(c => c.id !== collaboratorId));
  }, []);

  // Send chat message
  const sendCollabMessage = useCallback(async (content: string) => {
    if (!projectId || !userId || !userEmail || !content.trim()) return;
    await supabase.from('collab_messages').insert({
      project_id: projectId,
      user_id: userId,
      user_email: userEmail,
      content: content.trim(),
    });
  }, [projectId, userId, userEmail]);

  // File locking
  const lockFile = useCallback(async (filePath: string) => {
    if (!projectId || !userId || !userEmail) return false;
    const existing = fileLocks.find(l => l.file_path === filePath);
    if (existing && existing.locked_by !== userId) return false; // Locked by someone else
    if (existing && existing.locked_by === userId) return true; // Already locked by us

    const { error } = await supabase.from('file_locks').insert({
      project_id: projectId,
      file_path: filePath,
      locked_by: userId,
      locked_by_email: userEmail,
    });
    return !error;
  }, [projectId, userId, userEmail, fileLocks]);

  const unlockFile = useCallback(async (filePath: string) => {
    if (!projectId || !userId) return;
    await supabase.from('file_locks').delete().eq('project_id', projectId).eq('file_path', filePath).eq('locked_by', userId);
  }, [projectId, userId]);

  const isFileLocked = useCallback((filePath: string): FileLock | null => {
    return fileLocks.find(l => l.file_path === filePath && l.locked_by !== userId) || null;
  }, [fileLocks, userId]);

  const isFileLockedByMe = useCallback((filePath: string): boolean => {
    return fileLocks.some(l => l.file_path === filePath && l.locked_by === userId);
  }, [fileLocks, userId]);

  return {
    collaborators, messages, fileLocks, presenceUsers, loading,
    inviteCollaborator, removeCollaborator,
    sendCollabMessage,
    lockFile, unlockFile, isFileLocked, isFileLockedByMe,
    trackActiveFile,
  };
}

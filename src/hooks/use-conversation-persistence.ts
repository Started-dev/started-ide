import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChatMessage, Conversation } from '@/types/ide';
import type { User } from '@supabase/supabase-js';

const SAVE_DEBOUNCE_MS = 2000;

interface DBConversation {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  messages: unknown;
  created_at: string;
  updated_at: string;
}

function dbRowToConversation(row: DBConversation): Conversation {
  const rawMessages = (row.messages as any[]) || [];
  const messages: ChatMessage[] = rawMessages.map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    contextChips: m.contextChips,
  }));

  return {
    id: row.id,
    title: row.title,
    messages,
    createdAt: new Date(row.created_at),
    projectId: row.project_id,
  };
}

function messagesToJson(messages: ChatMessage[]): unknown[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp.toISOString(),
    contextChips: m.contextChips,
  }));
}

export function useConversationPersistence(projectId: string | null, user: User | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load conversations for the current project
  useEffect(() => {
    if (!projectId || !user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('project_id', projectId)
          .eq('user_id', user!.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const convs = (data || []).map(row => dbRowToConversation(row as DBConversation));
        setConversations(convs);
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    load();
    return () => { cancelled = true; };
  }, [projectId, user]);

  // Create a new conversation in the DB
  const createConversation = useCallback(async (conv: Conversation): Promise<string | null> => {
    if (!projectId || !user) return null;
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          id: conv.id,
          project_id: projectId,
          user_id: user.id,
          title: conv.title,
          messages: messagesToJson(conv.messages) as any,
        })
        .select('id')
        .single();

      if (error) throw error;
      setConversations(prev => [...prev, conv]);
      return data?.id || conv.id;
    } catch (err) {
      console.error('Failed to create conversation:', err);
      return null;
    }
  }, [projectId, user]);

  // Save conversation messages (debounced)
  const saveConversation = useCallback((convId: string, messages: ChatMessage[], title: string) => {
    if (!projectId || !user) return;

    // Update local state immediately
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, messages, title } : c
    ));

    // Debounce DB write
    if (saveTimers.current[convId]) {
      clearTimeout(saveTimers.current[convId]);
    }

    saveTimers.current[convId] = setTimeout(async () => {
      try {
        await supabase
          .from('conversations')
          .update({
            messages: messagesToJson(messages) as any,
            title,
            updated_at: new Date().toISOString(),
          })
          .eq('id', convId);
      } catch (err) {
        console.error('Failed to save conversation:', err);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [projectId, user]);

  // Delete a conversation from the DB
  const deleteConversationFromDB = useCallback(async (convId: string) => {
    try {
      await supabase.from('conversations').delete().eq('id', convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, []);

  return {
    conversations,
    loading,
    createConversation,
    saveConversation,
    deleteConversationFromDB,
  };
}

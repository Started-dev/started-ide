import { useState, useRef, useEffect } from 'react';
import { Users, Send, Lock, Unlock, UserPlus, X, Circle, MessageCircle, Shield, Eye, Edit, Check } from 'lucide-react';
import type { Collaborator, CollabMessage, FileLock, PresenceUser } from '@/hooks/use-collaboration';

interface CollaborationPanelProps {
  collaborators: Collaborator[];
  messages: CollabMessage[];
  fileLocks: FileLock[];
  presenceUsers: PresenceUser[];
  currentUserId: string;
  currentUserEmail: string;
  isOwner: boolean;
  onInvite: (email: string, role: 'viewer' | 'editor') => void;
  onRemoveCollaborator: (id: string) => void;
  onSendMessage: (content: string) => void;
  onClose: () => void;
}

export function CollaborationPanel({
  collaborators, messages, fileLocks, presenceUsers,
  currentUserId, currentUserEmail, isOwner,
  onInvite, onRemoveCollaborator, onSendMessage, onClose,
}: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<'people' | 'chat' | 'locks'>('people');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor'>('editor');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInvite = () => {
    if (inviteEmail.trim() && inviteEmail.includes('@')) {
      onInvite(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
    }
  };

  const handleSendChat = () => {
    if (chatInput.trim()) {
      onSendMessage(chatInput.trim());
      setChatInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] max-h-[600px] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Collaboration</span>
            {presenceUsers.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-ide-success/15 text-ide-success rounded-full">
                {presenceUsers.length + 1} online
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {(['people', 'chat', 'locks'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'people' && <Users className="h-3 w-3" />}
              {tab === 'chat' && <MessageCircle className="h-3 w-3" />}
              {tab === 'locks' && <Lock className="h-3 w-3" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'chat' && messages.length > 0 && (
                <span className="text-[10px] px-1 bg-primary/20 text-primary rounded-full">{messages.length}</span>
              )}
              {tab === 'locks' && fileLocks.length > 0 && (
                <span className="text-[10px] px-1 bg-ide-warning/20 text-ide-warning rounded-full">{fileLocks.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 min-h-[300px]">
          {activeTab === 'people' && (
            <div className="space-y-4">
              {/* Online presence */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Online Now</h4>
                <div className="space-y-1.5">
                  {/* Current user */}
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-accent/30">
                    <Circle className="h-2 w-2 fill-ide-success text-ide-success" />
                    <span className="text-xs text-foreground flex-1 truncate">{currentUserEmail} <span className="text-muted-foreground">(you)</span></span>
                    {isOwner && <span title="Owner"><Shield className="h-3 w-3 text-primary" /></span>}
                  </div>
                  {presenceUsers.map(u => (
                    <div key={u.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent/20">
                      <Circle className="h-2 w-2" style={{ fill: u.color, color: u.color }} />
                      <span className="text-xs text-foreground flex-1 truncate">{u.email}</span>
                      {u.activeFile && (
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{u.activeFile}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Collaborators list */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Collaborators</h4>
                {collaborators.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No collaborators yet. Invite someone below.</p>
                ) : (
                  <div className="space-y-1.5">
                    {collaborators.map(c => (
                      <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent/20 group">
                        <span className="text-xs text-foreground flex-1 truncate">{c.email}</span>
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          {c.role === 'editor' ? <Edit className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                          {c.role}
                        </span>
                        {!c.accepted && (
                          <span className="text-[10px] px-1 py-0.5 bg-ide-warning/15 text-ide-warning rounded-sm">pending</span>
                        )}
                        {c.accepted && (
                          <Check className="h-3 w-3 text-ide-success" />
                        )}
                        {isOwner && (
                          <button
                            onClick={() => onRemoveCollaborator(c.id)}
                            className="p-0.5 text-muted-foreground hover:text-ide-error opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invite form */}
              {isOwner && (
                <div className="pt-2 border-t border-border">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <UserPlus className="h-3 w-3 inline mr-1" />
                    Invite
                  </h4>
                  <div className="flex gap-2">
                    <input
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      placeholder="email@example.com"
                      className="flex-1 bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as 'viewer' | 'editor')}
                      className="bg-background border border-border rounded-sm px-2 py-1.5 text-xs text-foreground outline-none"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={handleInvite}
                      disabled={!inviteEmail.includes('@')}
                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-sm text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      Invite
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-2 mb-3 overflow-auto">
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start a conversation with your team.</p>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.user_id === currentUserId;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] text-muted-foreground mb-0.5">
                          {isMe ? 'You' : msg.user_email.split('@')[0]}
                          {' · '}
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className={`max-w-[85%] px-3 py-1.5 rounded-lg text-xs ${
                          isMe ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
          )}

          {activeTab === 'locks' && (
            <div className="space-y-2">
              {fileLocks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No files are currently locked.</p>
              ) : (
                fileLocks.map(lock => {
                  const isMe = lock.locked_by === currentUserId;
                  return (
                    <div key={lock.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm bg-accent/20">
                      <Lock className="h-3 w-3 text-ide-warning" />
                      <span className="text-xs font-mono text-foreground flex-1 truncate">{lock.file_path}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {isMe ? 'You' : lock.locked_by_email.split('@')[0]}
                      </span>
                      {isMe && (
                        <Unlock className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Chat input at bottom */}
        {activeTab === 'chat' && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
              placeholder="Type a message..."
              className="flex-1 bg-background border border-border rounded-sm px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              className="p-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { Circle } from 'lucide-react';
import type { PresenceUser } from '@/hooks/use-collaboration';

interface PresenceAvatarsProps {
  users: PresenceUser[];
  onClick: () => void;
}

export function PresenceAvatars({ users, onClick }: PresenceAvatarsProps) {
  if (users.length === 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-sm hover:bg-accent/50 transition-colors"
      title={`${users.length} collaborator${users.length > 1 ? 's' : ''} online`}
    >
      <div className="flex -space-x-1.5">
        {users.slice(0, 3).map(u => {
          const displayName = (u as any).displayName;
          const avatarUrl = (u as any).avatarUrl;
          const label = displayName || u.email;
          return (
            <div
              key={u.userId}
              className="h-5 w-5 rounded-full border-2 border-card flex items-center justify-center text-[8px] font-bold text-white overflow-hidden"
              style={{ backgroundColor: avatarUrl ? 'transparent' : u.color }}
              title={label}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={label} className="h-full w-full object-cover" />
              ) : (
                label[0].toUpperCase()
              )}
            </div>
          );
        })}
        {users.length > 3 && (
          <div className="h-5 w-5 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
            +{users.length - 3}
          </div>
        )}
      </div>
      <Circle className="h-1.5 w-1.5 fill-ide-success text-ide-success" />
    </button>
  );
}

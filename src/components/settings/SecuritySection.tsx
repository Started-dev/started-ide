import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Loader2, KeyRound } from 'lucide-react';

export function SecuritySection() {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setChanging(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated');
      setNewPassword('');
      setConfirmPassword('');
    }
    setChanging(false);
  };

  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString()
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Security</h2>
        <p className="text-sm text-muted-foreground">Manage your password and session.</p>
      </div>

      {/* User ID */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">User ID</span>
        </div>
        <p className="text-xs text-muted-foreground font-mono break-all">{user?.id}</p>
      </div>

      {/* Active Session */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-2">
        <span className="text-sm font-medium">Current Session</span>
        <p className="text-xs text-muted-foreground">Last sign-in: {lastSignIn}</p>
      </div>

      {/* Change Password */}
      <div className="p-4 rounded-lg border border-border bg-card space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Change Password</span>
        </div>
        <div className="space-y-3 max-w-sm">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
          <Button size="sm" onClick={handleChangePassword} disabled={changing || !newPassword}>
            {changing && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
            Update Password
          </Button>
        </div>
      </div>

      <Button variant="destructive" size="sm" onClick={signOut}>
        Sign Out
      </Button>
    </div>
  );
}

import { useState, useRef } from 'react';
import { useAuth, type Profile } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Camera, User } from 'lucide-react';

export function ProfileForm() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const avatarUrl = profile?.avatar_url;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast.error('Upload failed');
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    // Append cache-buster so the browser picks up the new image
    const urlWithBuster = `${publicUrl}?t=${Date.now()}`;

    await supabase.from('profiles').update({ avatar_url: urlWithBuster }).eq('id', user.id);
    await refreshProfile();
    setUploading(false);
    toast.success('Avatar updated');
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, bio })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to save profile');
    } else {
      await refreshProfile();
      toast.success('Profile saved');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Profile</h2>
        <p className="text-sm text-muted-foreground">Your public identity used in collaboration.</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-16 w-16 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden group"
          disabled={uploading}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <User className="h-7 w-7 text-muted-foreground" />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
          </div>
        </button>
        <div className="text-sm text-muted-foreground">
          Click to upload a profile photo.<br />
          Max 2 MB, JPG or PNG.
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      </div>

      {/* Display Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Display Name</label>
        <Input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="How others see you"
          maxLength={50}
        />
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Bio</label>
        <Textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="A short bio (max 280 characters)"
          maxLength={280}
          rows={3}
        />
        <p className="text-xs text-muted-foreground text-right">{bio.length}/280</p>
      </div>

      {/* Email (read-only) */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Email</label>
        <Input value={user?.email ?? ''} disabled />
        <p className="text-xs text-muted-foreground">
          Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
        </p>
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
        Save Profile
      </Button>
    </div>
  );
}

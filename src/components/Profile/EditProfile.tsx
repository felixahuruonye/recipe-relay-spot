import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Upload, X, Sun, Moon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EditProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProfile: {
    username: string;
    bio: string;
    avatar_url: string;
    full_name?: string;
    full_name_updated_at?: string | null;
  };
  onProfileUpdated: () => void;
}

export const EditProfile: React.FC<EditProfileProps> = ({ 
  open, 
  onOpenChange, 
  currentProfile,
  onProfileUpdated 
}) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState(currentProfile.username);
  const [bio, setBio] = useState(currentProfile.bio || '');
  const [fullName, setFullName] = useState(currentProfile.full_name || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(currentProfile.avatar_url);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const nameLocked = (() => {
    if (!currentProfile.full_name_updated_at) return null;
    const nextAllowed = new Date(currentProfile.full_name_updated_at);
    nextAllowed.setDate(nextAllowed.getDate() + 90);
    return nextAllowed > new Date() ? nextAllowed : null;
  })();

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Avatar must be less than 5MB",
          variant: "destructive"
        });
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const removeAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview('');
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;

    const fileExt = avatarFile.name.split('.').pop();
    const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(fileName, avatarFile);

    if (error) {
      console.error('Avatar upload error:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedName = fullName.trim();
    const nameChanged = trimmedName !== (currentProfile.full_name || '').trim();

    if (nameChanged && nameLocked) {
      toast({
        title: 'Name is locked',
        description: `You can change your Creator Name again on ${nameLocked.toLocaleDateString()}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      let avatarUrl = avatarPreview;

      // Upload new avatar if changed
      if (avatarFile) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
      }

      // Update profile (username, bio, avatar go straight through)
      const { error } = await supabase
        .from('user_profiles')
        .update({
          username: username.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl || null
        })
        .eq('id', user.id);

      if (error) throw error;

      // Creator Name is rate-limited server-side, so it goes through its own RPC
      if (nameChanged) {
        const { data, error: nameError } = await supabase.rpc('update_full_name' as any, {
          p_user_id: user.id,
          p_full_name: trimmedName,
        });
        if (nameError) throw nameError;
        if ((data as any)?.success === false) {
          toast({ title: 'Could not update Creator Name', description: (data as any).error, variant: 'destructive' });
          setLoading(false);
          return;
        }
      }

      toast({
        title: "Success",
        description: "Profile updated successfully"
      });

      onProfileUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto glass-card">
        <DialogHeader>
          <DialogTitle className="gradient-text">Edit Profile</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Theme Toggle */}
          <div className="glass-card p-4 space-y-3">
            <Label className="text-base font-semibold">Appearance Settings</Label>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <span className="text-sm">
                  {theme === 'dark' ? 'Dark Mode (3D Design)' : 'Light Mode'}
                </span>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={toggleTheme}
                className="btn-3d"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Toggle between light mode and dark mode with stunning 3D effects
            </p>
          </div>

          {/* Avatar */}
          <div className="space-y-2">
            <Label>Profile Picture</Label>
            <div className="flex items-center space-x-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={avatarPreview} />
                <AvatarFallback className="text-2xl">
                  {username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-2">
                <label className="cursor-pointer">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Photo
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
                {avatarPreview && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeAvatar}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Creator Name */}
          <div className="space-y-2">
            <Label htmlFor="full-name">Creator Name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your real name"
              maxLength={80}
              required
              disabled={!!nameLocked}
            />
            {nameLocked ? (
              <p className="text-xs text-muted-foreground">
                🔒 You can change this again on {nameLocked.toLocaleDateString()}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your real name, shown on your profile. Changing it locks it for 90 days.
              </p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={30}
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              maxLength={200}
              rows={4}
            />
            <div className="text-xs text-muted-foreground text-right">
              {bio.length}/200 characters
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

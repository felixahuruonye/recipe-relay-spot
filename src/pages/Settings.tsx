import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sun, Moon, Settings as SettingsIcon, MessageSquare, Share2, HelpCircle, LogOut, Lock } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isDark = theme === 'dark';
  const [lockFollowers, setLockFollowers] = useState(false);

  useEffect(() => {
    if (user) loadPrivacySettings();
  }, [user]);

  const loadPrivacySettings = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
    const settings = data?.story_settings as any;
    setLockFollowers(settings?.lock_followers || false);
  };

  const toggleLockFollowers = async (checked: boolean) => {
    if (!user) return;
    setLockFollowers(checked);
    const { data: current } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
    const existing = (current?.story_settings as any) || {};
    await supabase.from('user_profiles').update({
      story_settings: { ...existing, lock_followers: checked }
    }).eq('id', user.id);
    toast({ title: checked ? 'Followers Locked 🔒' : 'Followers Unlocked', description: checked ? 'Others can no longer see your followers/following.' : 'Your followers/following are now visible.' });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold gradient-text">Settings</h1>
      </div>

      {/* Theme Toggle Card */}
      <Card className="glass-card card-3d">
        <CardHeader><CardTitle className="flex items-center gap-2"><span className="gradient-text">Appearance</span></CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between glass-card p-4 rounded-lg border border-primary/20">
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-full bg-primary/10 neon-glow">
                {isDark ? <Moon className="h-6 w-6 text-primary" /> : <Sun className="h-6 w-6 text-primary" />}
              </div>
              <div>
                <Label htmlFor="theme-toggle" className="text-lg font-bold cursor-pointer">
                  {isDark ? 'Dark Mode' : 'Light Mode'}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {isDark ? 'Enjoying beautiful 3D designs and figma styles' : 'Switch to dark mode for enhanced visuals'}
                </p>
              </div>
            </div>
            <Switch id="theme-toggle" checked={isDark} onCheckedChange={toggleTheme} className="data-[state=checked]:bg-primary scale-125" />
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <Card className="glass-card card-3d">
        <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Privacy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between glass-card p-4 rounded-lg border border-primary/20">
            <div>
              <Label htmlFor="lock-followers" className="font-bold cursor-pointer">Lock Followers & Following</Label>
              <p className="text-sm text-muted-foreground mt-1">Hide your followers and following lists from other users</p>
            </div>
            <Switch id="lock-followers" checked={lockFollowers} onCheckedChange={toggleLockFollowers} />
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="glass-card">
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start h-14" onClick={() => navigate('/contact-admin')}>
            <MessageSquare className="h-5 w-5 mr-3" />
            <div className="text-left"><div className="font-medium">Contact Admin</div><div className="text-xs text-muted-foreground">Get help or report issues</div></div>
          </Button>
          <Button variant="outline" className="w-full justify-start h-14" onClick={() => navigate('/share')}>
            <Share2 className="h-5 w-5 mr-3" />
            <div className="text-left"><div className="font-medium">Share SaveMore Community</div><div className="text-xs text-muted-foreground">Invite friends to join</div></div>
          </Button>
          <Button variant="outline" className="w-full justify-start h-14" onClick={() => window.open('https://savemore.community/help', '_blank')}>
            <HelpCircle className="h-5 w-5 mr-3" />
            <div className="text-left"><div className="font-medium">Help & FAQ</div><div className="text-xs text-muted-foreground">Learn how to use SaveMore</div></div>
          </Button>
          <Button variant="destructive" className="w-full justify-start h-14 mt-4" onClick={handleSignOut}>
            <LogOut className="h-5 w-5 mr-3" />
            <div className="text-left"><div className="font-medium">Sign Out</div><div className="text-xs opacity-80">Log out of your account</div></div>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;

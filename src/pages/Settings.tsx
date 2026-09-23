import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Moon, Settings as SettingsIcon, MessageSquare, Share2, HelpCircle, LogOut, Lock, Coins, Trash2, Repeat2, MapPin, Smartphone, ShieldCheck } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { collectDeviceFingerprint } from '@/lib/deviceFingerprint';

interface UserProfile {
  id: string;
  created_at: string;
  vip: boolean;
  vip_expires_at: string;
}

const Settings = () => {
  const { theme, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isDark = theme === 'dark';
  const [lockFollowers, setLockFollowers] = useState(false);
  const [autoSpend, setAutoSpend] = useState(false);
  const [allowReposts, setAllowReposts] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [savingDemographics, setSavingDemographics] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [deviceConsent, setDeviceConsent] = useState(false);
  const [ageLockedAt, setAgeLockedAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user) {
      loadSettings();
      loadProfile();
      checkAdmin();
    }
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    try {
      const { data } = await (supabase as any).rpc('has_role', { _user_id: user.id, _role: 'admin' });
      setIsAdmin(!!data);
    } catch {
      setIsAdmin(false);
    }
  };

  const loadProfile = async () => {
    if (!user) return;
    try {
      const { data } = await (supabase as any)
        .from('user_profiles')
        .select('id, created_at, vip, vip_expires_at, gender, date_of_birth, device_tracking_consented, age_locked_at')
        .eq('id', user.id)
        .single();
      setProfile(data);
      setGender(data?.gender || '');
      setDob(data?.date_of_birth || '');
      setCountry('Nigeria'); // Default to Nigeria for now
      setStateRegion('');
      setDeviceConsent(data?.device_tracking_consented || false);
      setAgeLockedAt(data?.age_locked_at || null);

      // Load device info if consented
      if (data?.device_tracking_consented) {
        loadDeviceInfo();
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadDeviceInfo = async () => {
    if (!user) return;
    setLoadingDevice(true);
    try {
      const { data, error } = await (supabase as any)
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id)
        .order('last_seen', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setDeviceInfo(data || null);
    } catch (error) {
      console.error('Error loading device info:', error);
      setDeviceInfo(null);
    } finally {
      setLoadingDevice(false);
    }
  };

  const pullDeviceInformation = async () => {
    if (!user) return;
    setLoadingDevice(true);
    try {
      // Collect REAL browser/hardware signals — not a spoofable localStorage string
      const fingerprint = await collectDeviceFingerprint();

      const { data, error } = await (supabase as any).rpc('register_device_v2', {
        p_device_hash: fingerprint.hash,
        p_user_agent: fingerprint.userAgent,
        p_platform: fingerprint.platform,
        p_screen_resolution: fingerprint.screenResolution,
        p_timezone: fingerprint.timezone,
        p_language: fingerprint.language,
        p_hardware_concurrency: fingerprint.hardwareConcurrency,
        p_device_memory: fingerprint.deviceMemory,
        p_touch_support: fingerprint.touchSupport,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Registration failed');

      setDeviceConsent(true);
      setDeviceInfo(data.device);

      if (data.restricted) {
        toast({
          title: 'Device already registered elsewhere',
          description: 'This device is linked to another account. Earning features are restricted on this account.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Device registered',
          description: 'Your device information has been securely stored',
        });
      }
    } catch (error: any) {
      console.error('Error pulling device info:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to register device',
        variant: 'destructive',
      });
    } finally {
      setLoadingDevice(false);
    }
  };

  const isAgeLocked = !isAdmin && !!ageLockedAt && (Date.now() - new Date(ageLockedAt).getTime()) < 100 * 24 * 60 * 60 * 1000;
  const ageUnlockDate = ageLockedAt
    ? new Date(new Date(ageLockedAt).getTime() + 100 * 24 * 60 * 60 * 1000)
    : null;

  const saveDemographics = async () => {
    if (!user) return;
    setSavingDemographics(true);
    try {
      // Gender + country are freely editable
      const { error } = await (supabase as any)
        .from('user_profiles')
        .update({
          gender: gender || null,
          country_code: country || null,
        })
        .eq('id', user.id);
      if (error) throw error;

      // Date of birth goes through the locking RPC — only actually
      // calls it if the value changed and isn't currently locked.
      if (dob && dob !== profile?.date_of_birth && !isAgeLocked) {
        const { data: dobResult, error: dobError } = await (supabase as any).rpc('set_date_of_birth', {
          p_user_id: user.id,
          p_dob: dob,
        });
        if (dobError) throw dobError;
        if (!dobResult?.success) {
          toast({ title: 'Date of birth not updated', description: dobResult?.error || 'Locked', variant: 'destructive' });
          setSavingDemographics(false);
          return;
        }
        setAgeLockedAt(new Date().toISOString());
      }

      toast({ title: 'Saved', description: 'Your profile info was updated' });
      loadProfile();
    } catch (error: any) {
      console.error('Error saving demographics:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setSavingDemographics(false);
    }
  };

  const loadSettings = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
    const settings = data?.story_settings as any;
    setLockFollowers(settings?.lock_followers || false);
    setAutoSpend(settings?.auto_spend || false);
    // Default ON - only false if the user has explicitly disabled it before
    setAllowReposts(settings?.allow_reposts !== false);
  };

  const toggleAllowReposts = async (checked: boolean) => {
    if (!user) return;
    setAllowReposts(checked);
    const { data: current } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
    const existing = (current?.story_settings as any) || {};
    await supabase.from('user_profiles').update({
      story_settings: { ...existing, allow_reposts: checked }
    }).eq('id', user.id);
    toast({
      title: checked ? 'Reposts to Storyline enabled' : 'Reposts to Storyline disabled',
      description: checked
        ? 'Other users can now share your posts to their storyline.'
        : 'Other users can no longer share your posts to their storyline.'
    });
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

  const toggleAutoSpend = async (checked: boolean) => {
    if (!user) return;
    setAutoSpend(checked);
    const { data: current } = await supabase.from('user_profiles').select('story_settings').eq('id', user.id).single();
    const existing = (current?.story_settings as any) || {};
    await supabase.from('user_profiles').update({
      story_settings: { ...existing, auto_spend: checked }
    }).eq('id', user.id);
    toast({
      title: checked ? '⭐ Auto-Spend ON' : '⭐ Auto-Spend OFF',
      description: checked
        ? 'You will now earn when watching posts. Stars are spent to support creators.'
        : 'Auto-spend is off. You won\'t earn or spend stars when watching posts.'
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!confirm('Are you ABSOLUTELY sure? This will permanently delete your entire account and all your data. This cannot be undone.')) return;
    
    const confirmText = prompt('Type DELETE to permanently remove your account:');
    if (confirmText !== 'DELETE') {
      toast({ title: 'Cancelled', description: 'Account deletion cancelled.' });
      return;
    }

    setDeleting(true);
    try {
      const res = await supabase.functions.invoke('delete-user', {
        body: { target_user_id: user.id, self_delete: true },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.success === false) throw new Error(res.data.error);
      toast({ title: 'Account Deleted', description: 'Your account has been permanently removed.' });
      await signOut();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold gradient-text">Settings</h1>
      </div>

      {/* Auto-Spend Toggle */}
      <Card className="glass-card card-3d border-yellow-500/30">
        <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="w-5 h-5 text-yellow-500" /> Earning & Stars</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between glass-card p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
            <div>
              <Label htmlFor="auto-spend" className="font-bold cursor-pointer">Auto-Spend Stars ⭐</Label>
              <p className="text-sm text-muted-foreground mt-1">
                When ON, stars are automatically spent when you watch posts. You earn from each post you view, like, or comment on. When OFF, you watch without earning or spending.
              </p>
            </div>
            <Switch id="auto-spend" checked={autoSpend} onCheckedChange={toggleAutoSpend} className="data-[state=checked]:bg-yellow-500" />
          </div>
          <p className="text-xs text-muted-foreground px-1">
            💡 1 Star = ₦300 · Earnings split: Creator 40% · Viewer 35% · Platform 25%
          </p>
        </CardContent>
      </Card>

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
          <div className="flex items-center justify-between glass-card p-4 rounded-lg border border-primary/20">
            <div className="flex items-center gap-3">
              <Repeat2 className="w-5 h-5 text-muted-foreground shrink-0" />
              <div>
                <Label htmlFor="allow-reposts" className="font-bold cursor-pointer">Allow Reposts to Storyline</Label>
                <p className="text-sm text-muted-foreground mt-1">Let other users share your posts to their own storyline</p>
              </div>
            </div>
            <Switch id="allow-reposts" checked={allowReposts} onCheckedChange={toggleAllowReposts} />
          </div>
        </CardContent>
      </Card>

      {/* Personal Info - powers Creator Dashboard demographic analytics */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Personal Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Optional. Used to power viewer insights on creators' dashboards (e.g. "most of my viewers are 18-24").
            Never shown publicly on your profile.
          </p>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="Prefer not to say" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              disabled={isAgeLocked}
            />
            {isAgeLocked && ageUnlockDate && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Locked until {ageUnlockDate.toLocaleDateString()} to prevent age fraud
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Nigeria" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} placeholder="e.g. Lagos" />
            </div>
          </div>
          <Button onClick={saveDemographics} disabled={savingDemographics} className="w-full">
            {savingDemographics ? 'Saving...' : 'Save'}
          </Button>
        </CardContent>
      </Card>

      {/* Device Information - For Fraud Detection */}
      <Card className="glass-card border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-500" /> Device Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Your device is securely registered to prevent fraudulent accounts. This information is only used by our fraud detection system and is never shared. You can only remove this by deleting your account.
          </p>

          {!deviceConsent ? (
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-blue-600 font-medium mb-3">Pull Device Information</p>
              <p className="text-xs text-blue-600/80 mb-3">
                Click below to register your device. This helps us detect and block fraudulent accounts trying to access earnings on this device.
              </p>
              <Button
                onClick={pullDeviceInformation}
                disabled={loadingDevice}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loadingDevice ? 'Registering device...' : 'Register This Device'}
              </Button>
            </div>
          ) : loadingDevice ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
            </div>
          ) : deviceInfo ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <p className="text-xs font-semibold text-green-600">Device Registered — this is exactly what we have on file</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Device fingerprint:</span>
                  <span className="font-mono text-[11px] text-right break-all">{deviceInfo.device_id?.slice(0, 16)}…</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Browser/OS:</span>
                  <span className="text-right text-xs break-all">{deviceInfo.user_agent || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Platform:</span>
                  <span className="text-right">{deviceInfo.platform || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Screen:</span>
                  <span className="text-right">{deviceInfo.screen_resolution || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Timezone:</span>
                  <span className="text-right">{deviceInfo.timezone || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Language:</span>
                  <span className="text-right">{deviceInfo.language || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">First registered:</span>
                  <span className="text-right">{deviceInfo.first_seen ? new Date(deviceInfo.first_seen).toLocaleDateString() : '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <span className="text-muted-foreground shrink-0">Last seen:</span>
                  <span className="text-right">{deviceInfo.last_seen ? new Date(deviceInfo.last_seen).toLocaleString() : '—'}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                This is used only to detect the same device opening multiple accounts to farm earnings. You can't edit or remove it yourself — deleting your account is the only way to clear it{isAdmin ? ' (admin accounts can also remove device records from the Admin panel).' : '.'}
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-600 mb-3">
                Your device consent is on file, but we couldn't load the stored record. This can happen right after switching browsers — try registering again.
              </p>
              <Button onClick={pullDeviceInformation} disabled={loadingDevice} variant="outline" className="w-full">
                Register This Device Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Settings */}
      {profile && (
        <Card className="glass-card">
          <CardHeader><CardTitle>Account Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Account Created</p>
              <p className="text-sm text-muted-foreground">{new Date(profile.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium">User ID</p>
              <p className="text-xs text-muted-foreground font-mono break-all">{profile.id}</p>
            </div>
            {profile.vip && (
              <div>
                <p className="text-sm font-medium">VIP Status</p>
                <p className="text-sm text-muted-foreground">Expires: {new Date(profile.vip_expires_at).toLocaleDateString()}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
            <div className="text-left"><div className="font-medium">Share Lenory</div><div className="text-xs text-muted-foreground">Invite friends to join</div></div>
          </Button>
          <Button variant="outline" className="w-full justify-start h-14" onClick={() => window.open('https://lenory.com/help', '_blank')}>
            <HelpCircle className="h-5 w-5 mr-3" />
            <div className="text-left"><div className="font-medium">Help & FAQ</div><div className="text-xs text-muted-foreground">Learn how to use Lenory</div></div>
          </Button>
          <Button variant="destructive" className="w-full justify-start h-14 mt-4" onClick={handleSignOut}>
            <LogOut className="h-5 w-5 mr-3" />
            <div className="text-left"><div className="font-medium">Sign Out</div><div className="text-xs opacity-80">Log out of your account</div></div>
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="border-destructive mt-4">
        <CardHeader>
          <CardTitle className="text-destructive text-lg flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Delete Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This will permanently delete your account, all posts, messages, groups, balances, and remove you from Supabase authentication. This cannot be undone.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleting ? 'Deleting...' : 'Delete My Account Permanently'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;

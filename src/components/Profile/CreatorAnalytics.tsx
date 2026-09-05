import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Star, Loader2, Eye, TrendingUp, Users, Cake, MapPin, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type RangePreset = '7' | '28' | '60' | '365' | 'custom';

interface ViewStats {
  total_views: number;
  new_views: number;
  daily: { day: string; views: number }[];
}

const rangeToDates = (preset: RangePreset, customDate?: Date): { start: Date; end: Date } => {
  const end = new Date();
  if (preset === 'custom' && customDate) {
    const start = new Date(customDate);
    start.setHours(0, 0, 0, 0);
    const dayEnd = new Date(customDate);
    dayEnd.setHours(23, 59, 59, 999);
    return { start, end: dayEnd };
  }
  const days = parseInt(preset, 10);
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end };
};

export const CreatorAnalytics: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [preset, setPreset] = useState<RangePreset>('7');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [loadingData, setLoadingData] = useState(false);
  const [viewStats, setViewStats] = useState<ViewStats | null>(null);
  const [genders, setGenders] = useState<{ gender: string; count: number }[]>([]);
  const [ages, setAges] = useState<{ bucket: string; count: number }[]>([]);
  const [locations, setLocations] = useState<{ country: string; state: string | null; count: number }[]>([]);

  useEffect(() => {
    if (user) checkUnlock();
  }, [user]);

  useEffect(() => {
    if (unlocked) fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, preset, customDate]);

  const checkUnlock = async () => {
    if (!user) return;
    setChecking(true);
    try {
      const { data, error } = await (supabase as any)
        .from('creator_analytics_unlocks')
        .select('expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      const active = !!data && new Date(data.expires_at) > new Date();
      setUnlocked(active);
      setExpiresAt(data?.expires_at || null);
    } catch (error) {
      console.error('Error checking analytics unlock:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleUnlock = async () => {
    if (!user) return;
    setUnlocking(true);
    try {
      const { data, error } = await supabase.rpc('unlock_creator_analytics' as any, { p_user_id: user.id });
      if (error) throw error;
      if ((data as any)?.success === false) {
        toast({ title: 'Not enough Stars', description: 'You need 250 Stars to unlock advanced analytics', variant: 'destructive' });
        return;
      }
      setUnlocked(true);
      setExpiresAt((data as any)?.expires_at || null);
      toast({ title: 'Unlocked!', description: '250 Stars deducted. Access lasts 100 days.' });
    } catch (error: any) {
      console.error('Error unlocking analytics:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to unlock', variant: 'destructive' });
    } finally {
      setUnlocking(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingData(true);
    try {
      const { start, end } = rangeToDates(preset, customDate);
      const [viewsRes, gendersRes, agesRes, locsRes] = await Promise.all([
        supabase.rpc('get_creator_view_stats' as any, { p_start: start.toISOString(), p_end: end.toISOString() }),
        supabase.rpc('get_creator_viewer_genders' as any, { p_start: start.toISOString(), p_end: end.toISOString() }),
        supabase.rpc('get_creator_viewer_ages' as any, { p_start: start.toISOString(), p_end: end.toISOString() }),
        supabase.rpc('get_creator_viewer_locations' as any, { p_start: start.toISOString(), p_end: end.toISOString() }),
      ]);
      if (viewsRes.error) throw viewsRes.error;
      setViewStats(viewsRes.data as any);
      setGenders((gendersRes.data as any) || []);
      setAges((agesRes.data as any) || []);
      setLocations((locsRes.data as any) || []);
    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to load analytics', variant: 'destructive' });
    } finally {
      setLoadingData(false);
    }
  };

  if (checking) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!unlocked) {
    return (
      <Card className="glass-card">
        <CardContent className="py-10 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-lg">Unlock Advanced Analytics</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              See detailed view trends, and who's watching your content by gender, age, and location. Unlocks for 100 days.
            </p>
          </div>
          <Button onClick={handleUnlock} disabled={unlocking} className="gap-2">
            {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 fill-current" />}
            Unlock for 250 Stars
          </Button>
        </CardContent>
      </Card>
    );
  }

  const maxGender = Math.max(1, ...genders.map(g => g.count));
  const maxAge = Math.max(1, ...ages.map(a => a.count));
  const maxLoc = Math.max(1, ...locations.map(l => l.count));

  const genderLabel = (g: string) => g === 'unspecified' ? 'Not specified' : g.charAt(0).toUpperCase() + g.slice(1);

  return (
    <div className="space-y-4">
      {expiresAt && (
        <p className="text-xs text-muted-foreground">Advanced analytics unlocked until {new Date(expiresAt).toLocaleDateString()}</p>
      )}

      {/* Time frame selector */}
      <div className="flex gap-2 flex-wrap items-center">
        {(['7', '28', '60', '365'] as RangePreset[]).map(p => (
          <Button key={p} size="sm" variant={preset === p ? 'default' : 'outline'} onClick={() => { setPreset(p); setCustomDate(undefined); }}>
            {p} days
          </Button>
        ))}
        <label className={`inline-flex items-center gap-1.5 text-sm border rounded-md px-3 py-1.5 cursor-pointer hover:bg-muted/50 ${preset === 'custom' ? 'bg-primary text-primary-foreground' : ''}`}>
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{preset === 'custom' && customDate ? customDate.toLocaleDateString() : 'Custom date'}</span>
          <input
            type="date"
            className="sr-only"
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              if (e.target.value) {
                setCustomDate(new Date(e.target.value + 'T00:00:00'));
                setPreset('custom');
              }
            }}
          />
        </label>
      </div>

      {loadingData ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Views cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><TrendingUp className="w-4 h-4" /> Total Views</div>
                <p className="text-2xl font-bold">{(viewStats?.total_views || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">All-time, across every post</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Eye className="w-4 h-4" /> New Views</div>
                <p className="text-2xl font-bold">{(viewStats?.new_views || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {preset === 'custom' && customDate ? `On ${customDate.toLocaleDateString()}` : `Last ${preset} days`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Viewer Insights: Gender */}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Viewer Insights - Gender</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {genders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No viewer data for this period yet</p>
              ) : genders.map(g => (
                <div key={g.gender}>
                  <div className="flex justify-between text-xs mb-1"><span>{genderLabel(g.gender)}</span><span>{g.count}</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(g.count / maxGender) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">Based on gender viewers have set in their own Settings.</p>
            </CardContent>
          </Card>

          {/* Age */}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Cake className="w-4 h-4" /> Age Groups</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {ages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No engagement data for this period yet</p>
              ) : ages.map(a => (
                <div key={a.bucket}>
                  <div className="flex justify-between text-xs mb-1"><span>{a.bucket === 'unspecified' ? 'Not specified' : a.bucket}</span><span>{a.count}</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(a.count / maxAge) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">Based on people who viewed, liked, commented, or followed you - using birthdays set in Settings.</p>
            </CardContent>
          </Card>

          {/* Location */}
          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> Location</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No viewer location data for this period yet</p>
              ) : locations.map((l, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{l.state ? `${l.state}, ${l.country}` : l.country}</span>
                      <span>{l.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(l.count / maxLoc) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">Based on the country/state viewers have set in their own Settings.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default CreatorAnalytics;

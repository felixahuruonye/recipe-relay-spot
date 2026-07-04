import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Star, Wallet, Ban } from 'lucide-react';

interface Props { userId: string }

const LEVELS = [
  { level: 0, label: 'Starter', needFollowers: 0, needReactions: 0 },
  { level: 1, label: 'Level 1', needFollowers: 50, needReactions: 100 },
  { level: 2, label: 'Level 2', needFollowers: 500, needReactions: 1000 },
  { level: 3, label: 'Level 3', needFollowers: 5000, needReactions: 10000 },
];

export const CreatorMonetizationCard: React.FC<Props> = ({ userId }) => {
  const [profile, setProfile] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<{ views: number; tips: number; stories: number }>({ views: 0, tips: 0, stories: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: p } = await supabase
        .from('user_profiles')
        .select('monetization_level, earning_banned, view_earn_progress, story_earn_progress, follower_count, total_reactions, wallet_balance, total_earned, star_balance')
        .eq('id', userId).maybeSingle();
      if (!cancelled) setProfile(p);
      const { data: events } = await (supabase as any)
        .from('monetization_events')
        .select('event_type, creator_amount')
        .eq('creator_id', userId);
      if (events && !cancelled) {
        const agg = { views: 0, tips: 0, stories: 0 };
        for (const e of events as any[]) {
          if (e.event_type === 'first_view') agg.views += Number(e.creator_amount || 0);
          else if (e.event_type === 'tip') agg.tips += Number(e.creator_amount || 0);
          else if (e.event_type === 'story_view') agg.stories += Number(e.creator_amount || 0);
        }
        setBreakdown(agg);
      }
    };
    load();
    const ch = supabase
      .channel('creator-monetization-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${userId}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monetization_events', filter: `creator_id=eq.${userId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId]);

  if (!profile) return null;
  const level = profile.monetization_level || 0;
  const next = LEVELS[Math.min(level + 1, LEVELS.length - 1)];
  const followers = profile.follower_count || 0;
  const reactions = profile.total_reactions || 0;
  const fPct = Math.min(100, next.needFollowers ? (followers / next.needFollowers) * 100 : 100);
  const rPct = Math.min(100, next.needReactions ? (reactions / next.needReactions) * 100 : 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Creator Monetization</span>
          {profile.earning_banned ? (
            <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" />Banned</Badge>
          ) : (
            <Badge variant="secondary">{LEVELS[level]?.label ?? `Level ${level}`}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-muted-foreground">Views</div><div className="text-sm font-semibold">₦{breakdown.views.toFixed(0)}</div></div>
          <div><div className="text-xs text-muted-foreground">Tips</div><div className="text-sm font-semibold">₦{breakdown.tips.toFixed(0)}</div></div>
          <div><div className="text-xs text-muted-foreground">Stories</div><div className="text-sm font-semibold">₦{breakdown.stories.toFixed(0)}</div></div>
        </div>

        {level < 3 && !profile.earning_banned && (
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1"><span>Followers → {next.label}</span><span>{followers}/{next.needFollowers}</span></div>
              <Progress value={fPct} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1"><span>Reactions → {next.label}</span><span>{reactions}/{next.needReactions}</span></div>
              <Progress value={rPct} className="h-2" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <span className="flex items-center gap-1"><Wallet className="w-4 h-4" />₦{Number(profile.wallet_balance || 0).toFixed(0)}</span>
          <span className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500" />{profile.star_balance || 0}</span>
          <span className="text-xs text-muted-foreground">Lifetime ₦{Number(profile.total_earned || 0).toFixed(0)}</span>
        </div>

        {profile.earning_banned && (
          <p className="text-xs text-destructive">Earnings paused by admin. Contact support if you believe this is a mistake.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CreatorMonetizationCard;

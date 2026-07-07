import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Star, Coins, TrendingUp, Gift } from 'lucide-react';

type GateProfile = { id: string; username: string; avatar_url: string | null; bio: string | null };
type Stage = 'loading' | 'follow-referrer' | 'follow-founder' | 'welcome' | 'done';

const Welcome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('loading');
  const [referrer, setReferrer] = useState<GateProfile | null>(null);
  const [founder, setFounder] = useState<GateProfile | null>(null);
  const [following, setFollowing] = useState(false);
  const [myName, setMyName] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: myProfile } = await supabase
        .from('user_profiles').select('username, full_name, referred_by').eq('id', user.id).maybeSingle();
      setMyName(myProfile?.full_name || myProfile?.username || 'there');

      // Who's already followed, so a returning-but-interrupted user doesn't get stuck re-following
      const { data: myFollows } = await supabase.from('followers').select('following_id').eq('follower_id', user.id);
      const alreadyFollowing = new Set((myFollows || []).map(f => f.following_id));

      let referrerProfile: GateProfile | null = null;
      if ((myProfile as any)?.referred_by) {
        const { data: refData } = await supabase
          .from('user_profiles').select('id, username, avatar_url, bio').eq('id', (myProfile as any).referred_by).maybeSingle();
        referrerProfile = (refData as GateProfile) || null;
      }

      const { data: founderRows } = await supabase.rpc('resolve_founder_account' as any);
      const founderProfile: GateProfile | null = (Array.isArray(founderRows) ? founderRows[0] : founderRows) || null;

      setReferrer(referrerProfile);
      setFounder(founderProfile);

      if (referrerProfile && referrerProfile.id !== user.id && !alreadyFollowing.has(referrerProfile.id)) {
        setStage('follow-referrer');
      } else if (founderProfile && founderProfile.id !== user.id && !alreadyFollowing.has(founderProfile.id)) {
        setStage('follow-founder');
      } else {
        setStage('welcome');
      }
    })();
  }, [user]);

  const follow = async (target: GateProfile, next: Stage) => {
    if (!user) return;
    setFollowing(true);
    await supabase.from('followers').insert({ follower_id: user.id, following_id: target.id } as any);
    setFollowing(false);
    if (next === 'follow-founder' && founder && founder.id !== user.id) {
      setStage('follow-founder');
    } else {
      setStage('welcome');
    }
  };

  const finish = async () => {
    if (user) await supabase.rpc('complete_onboarding' as any);
    navigate('/', { replace: true });
  };

  const openHelp = () => {
    window.open('https://lenory.com/help', '_blank');
  };

  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (stage === 'follow-referrer' && referrer) {
    return (
      <FollowGateCard
        profile={referrer}
        loading={following}
        onFollow={() => follow(referrer, 'follow-founder')}
      />
    );
  }

  if (stage === 'follow-founder' && founder) {
    return (
      <FollowGateCard
        profile={founder}
        loading={following}
        onFollow={() => follow(founder, 'welcome')}
      />
    );
  }

  // stage === 'welcome' (also the fallback if no referrer/founder could be resolved)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 space-y-5 shadow-lg">
        <div className="flex flex-col items-center text-center gap-3">
          <img src="/lernory-logo.png" alt="Lenory Social" className="w-16 h-16 rounded-xl" />
          <h1 className="text-xl font-bold">Welcome to Lenory Social, {myName}! 🎉</h1>
          <p className="text-sm text-muted-foreground">
            Connect, learn, share, and earn — here's a quick rundown before you dive in.
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex gap-3 items-start">
            <Coins className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p><b>Stars</b> are our in-app currency — buy them to watch, like, comment, and tip creators. 1 Star = ₦300.</p>
          </div>
          <div className="flex gap-3 items-start">
            <TrendingUp className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p><b>Levels</b> unlock earning as you grow followers and engagement — check your progress on your Profile dashboard.</p>
          </div>
          <div className="flex gap-3 items-start">
            <Gift className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p><b>Tipping</b> lets you support creators directly — tap the tip button on any monetized post.</p>
          </div>
          <div className="flex gap-3 items-start">
            <Star className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p>Find your <b>Wallet</b>, <b>Storyline</b>, and <b>Marketplace</b> from the bottom navigation bar - everything's just a tap away.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button variant="outline" onClick={openHelp} className="w-full">Read More</Button>
          <Button onClick={finish} className="w-full">View Later</Button>
        </div>
      </div>
    </div>
  );
};

const FollowGateCard = ({ profile, loading, onFollow }: { profile: GateProfile; loading: boolean; onFollow: () => void }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
    <div className="w-full max-w-md rounded-2xl border bg-card p-6 flex flex-col items-center text-center gap-4 shadow-lg">
      <Avatar className="w-24 h-24 border-4 border-primary/20">
        <AvatarImage src={profile.avatar_url || undefined} />
        <AvatarFallback className="text-2xl">{profile.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
      </Avatar>
      <div>
        <h2 className="text-lg font-bold">@{profile.username}</h2>
        {profile.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
      </div>
      <div className="w-full rounded-xl bg-primary/10 text-primary text-sm font-medium py-2 px-4">
        Follow @{profile.username} to continue to the next step
      </div>
      <Button onClick={onFollow} disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Follow @{profile.username}
      </Button>
    </div>
  </div>
);

export default Welcome;

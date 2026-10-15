import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutGrid, LineChart, Megaphone, Eye, Wallet, Heart, Star,
  ChevronRight, Gift, PlayCircle, CalendarCheck, Users, Flag,
  Shield, HelpCircle, AlertTriangle, Ban, Pause, CheckCircle2, CircleDot
} from 'lucide-react';
import { CreatorMonetizationCard } from '@/components/Profile/CreatorMonetizationCard';
import { WithdrawalForm } from '@/components/Profile/WithdrawalForm';
import { CreatorAnalytics } from '@/components/Profile/CreatorAnalytics';
import { useToast } from '@/hooks/use-toast';

type RoleTab = 'viewer' | 'creator';
type HeaderTab = 'overview' | 'details' | 'ads';
type DetailPane = 'posts_viewed' | 'tip_earnings' | 'engagements' | 'stars_spent' | null;
type PeriodKey = '7d' | '14d' | '30d' | '90d' | 'custom';

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '14d', label: 'Last 14 days', days: 14 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom', days: null },
];

const formatNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n || 0);

const CreatorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [roleTab, setRoleTab] = useState<RoleTab>('viewer');
  const [headerTab, setHeaderTab] = useState<HeaderTab>('overview');
  const [detailPane, setDetailPane] = useState<DetailPane>(null);
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Viewer stats
  const [postsViewed, setPostsViewed] = useState(0);
  const [postsViewedDelta, setPostsViewedDelta] = useState<number | null>(null);
  const [tipEarnings, setTipEarnings] = useState(0);
  const [tipDelta, setTipDelta] = useState<number | null>(null);
  const [engagements, setEngagements] = useState(0);
  const [engagementsDelta, setEngagementsDelta] = useState<number | null>(null);
  const [starsSpent, setStarsSpent] = useState(0);
  const [starsSpentDelta, setStarsSpentDelta] = useState<number | null>(null);

  // Wallet
  const [available, setAvailable] = useState(0);
  const [pendingCashback, setPendingCashback] = useState(0);
  const [lifetimeRewards, setLifetimeRewards] = useState(0);

  // Verification
  const [verifyLevel, setVerifyLevel] = useState(0); // 0 = not verified, 1-3
  const [earningStatus, setEarningStatus] = useState<'active' | 'paused' | 'suspended' | 'banned' | 'not_verified'>('not_verified');

  // Detail data
  const [viewedPosts, setViewedPosts] = useState<any[]>([]);
  const [starSpendRows, setStarSpendRows] = useState<any[]>([]);
  const [followCount, setFollowCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);

  // Creator stats (existing)
  const [creatorStats, setCreatorStats] = useState({
    totalViews: 0,
    totalEarnings: 0,
    followerCount: 0,
    postCount: 0,
    totalReactions: 0,
  });

  const periodStart = useMemo(() => {
    const p = PERIODS.find((x) => x.key === period);
    if (!p?.days) return null;
    const d = new Date();
    d.setDate(d.getDate() - p.days);
    return d.toISOString();
  }, [period]);

  const loadViewerStats = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const uid = user.id;
      const since = periodStart;

      // Profile wallet + verification fields (best-effort columns)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (profile) {
        setAvailable(Number((profile as any).wallet_balance || 0));
        setPendingCashback(Number((profile as any).pending_tip_earnings || 0));
        setLifetimeRewards(
          Number((profile as any).total_earned || 0) +
            Number((profile as any).pending_tip_earnings || 0)
        );
        const lvl = Number((profile as any).verification_level ?? (profile as any).verify_level ?? 0);
        setVerifyLevel(Number.isFinite(lvl) ? lvl : 0);
        const status = String((profile as any).earning_status || (profile as any).account_status || '').toLowerCase();
        if (status.includes('ban')) setEarningStatus('banned');
        else if (status.includes('suspend')) setEarningStatus('suspended');
        else if (status.includes('pause')) setEarningStatus('paused');
        else if (lvl >= 2) setEarningStatus('active');
        else setEarningStatus('not_verified');
      }

      // Posts viewed (post_views or similar)
      let viewsQ = (supabase as any)
        .from('post_views')
        .select('post_id, created_at, viewed_at', { count: 'exact' })
        .eq('user_id', uid);
      if (since) viewsQ = viewsQ.gte('created_at', since);
      let viewsRes = await viewsQ.limit(500);
      if (viewsRes.error) {
        // fallback: watch duration / public views tables
        viewsRes = { data: [], count: 0, error: null };
      }
      const viewRows = viewsRes.data || [];
      setPostsViewed(viewsRes.count ?? viewRows.length);

      // Unique posts for grid
      const postIds = [...new Set(viewRows.map((r: any) => r.post_id).filter(Boolean))].slice(0, 60);
      if (postIds.length) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id, title, media_urls, thumbnail_url, media_type, view_count')
          .in('id', postIds);
        setViewedPosts(posts || []);
      } else {
        setViewedPosts([]);
      }

      // Tip / cashback earnings from tip_ledger (as viewer)
      let tipQ = (supabase as any)
        .from('tip_ledger')
        .select('viewer_ngn, stars, created_at, post_id')
        .eq('from_user_id', uid);
      if (since) tipQ = tipQ.gte('created_at', since);
      const tipRes = await tipQ.limit(200);
      const tips = tipRes.data || [];
      const tipSum = tips.reduce((s: number, t: any) => s + Number(t.viewer_ngn || 0), 0);
      setTipEarnings(tipSum);

      // Stars spent from tip_ledger
      const starsSum = tips.reduce((s: number, t: any) => s + Number(t.stars || 0), 0);
      setStarsSpent(starsSum);
      setStarSpendRows(
        tips.map((t: any) => ({
          id: t.post_id + String(t.created_at),
          stars: t.stars,
          amount: t.viewer_ngn,
          created_at: t.created_at,
          label: `Tip ⭐${t.stars}`,
        }))
      );

      // Engagements: likes + comments + follows in period
      let likesQ = (supabase as any).from('post_likes').select('id', { count: 'exact', head: true }).eq('user_id', uid);
      if (since) likesQ = likesQ.gte('created_at', since);
      const likesRes = await likesQ;

      let commentsQ = (supabase as any).from('comments').select('id', { count: 'exact', head: true }).eq('user_id', uid);
      if (since) commentsQ = commentsQ.gte('created_at', since);
      const commentsRes = await commentsQ;

      let followsQ = (supabase as any).from('followers').select('id', { count: 'exact', head: true }).eq('follower_id', uid);
      if (since) followsQ = followsQ.gte('created_at', since);
      const followsRes = await followsQ;

      const lc = likesRes.count || 0;
      const cc = commentsRes.count || 0;
      const fc = followsRes.count || 0;
      setLikeCount(lc);
      setCommentCount(cc);
      setFollowCount(fc);
      setEngagements(lc + cc + fc);

      // Simple deltas: compare to previous equal window when possible (placeholder %)
      setPostsViewedDelta(null);
      setTipDelta(null);
      setEngagementsDelta(null);
      setStarsSpentDelta(null);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Could not load dashboard', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, periodStart, toast]);

  const loadCreatorStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('follower_count, post_count, wallet_balance, total_reactions')
        .eq('id', user.id)
        .single();

      const { data: postsData } = await supabase
        .from('posts')
        .select('id, view_count')
        .eq('user_id', user.id);

      const postIds = (postsData || []).map((p: any) => p.id);
      let totalReactions = profileData?.total_reactions;
      if (totalReactions === null || totalReactions === undefined) {
        const { count } = postIds.length
          ? await (supabase as any).from('post_likes').select('*', { count: 'exact', head: true }).in('post_id', postIds)
          : { count: 0 };
        totalReactions = count || 0;
      }

      setCreatorStats({
        totalViews: (postsData || []).reduce((sum: number, p: any) => sum + (p.view_count || 0), 0),
        totalEarnings: Number(profileData?.wallet_balance || 0),
        followerCount: profileData?.follower_count || 0,
        postCount: profileData?.post_count || 0,
        totalReactions: totalReactions || 0,
      });
    } catch (e) {
      console.error(e);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (roleTab === 'viewer') loadViewerStats();
    else loadCreatorStats();
  }, [user?.id, roleTab, period, loadViewerStats, loadCreatorStats]);

  const openDetail = (pane: DetailPane) => {
    setDetailPane(pane);
    setHeaderTab('details');
  };

  const periodLabel = PERIODS.find((p) => p.key === period)?.label || 'Last 7 days';

  const Delta = ({ value }: { value: number | null }) => {
    if (value === null || value === undefined) return <span className="text-xs text-white/40">— 0%</span>;
    const up = value >= 0;
    return (
      <span className={`text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '↑' : '↓'} {Math.abs(value)}%
      </span>
    );
  };

  const StatTile = ({
    icon: Icon,
    label,
    value,
    delta,
    onClick,
    accent = 'purple',
  }: {
    icon: any;
    label: string;
    value: string | number;
    delta?: number | null;
    onClick?: () => void;
    accent?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left rounded-2xl p-4 bg-[#1a1b3a]/90 border border-white/10 hover:border-violet-500/40 transition-colors shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
            <Icon className="w-4.5 h-4.5 text-violet-300" />
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-white/40" />
      </div>
      <p className="mt-3 text-xs text-white/50 font-medium">{label}</p>
      <p className="text-2xl font-bold text-white tracking-tight mt-0.5">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <div className="mt-1">
        <Delta value={delta ?? null} />
      </div>
    </button>
  );

  const EarningStatusBadge = () => {
    const map = {
      active: { label: 'Active earning', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle2 },
      paused: { label: 'Paused earning', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: Pause },
      suspended: { label: 'Suspended account', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30', icon: AlertTriangle },
      banned: { label: 'Banned account', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: Ban },
      not_verified: { label: 'Not Verified', color: 'bg-violet-500/20 text-violet-200 border-violet-500/30', icon: CircleDot },
    } as const;
    const cfg = map[earningStatus];
    const Icon = cfg.icon;
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </div>
    );
  };

  // ——— Viewer Details panes ———
  const renderViewerDetails = () => {
    if (detailPane === 'posts_viewed') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Posts viewed</h2>
            <Badge variant="secondary">{postsViewed} total</Badge>
          </div>
          <p className="text-xs text-white/50">{periodLabel} · tap a post to open in feed</p>
          {viewedPosts.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-12">No viewed posts in this period</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {viewedPosts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/?post=${encodeURIComponent(p.id)}`)}
                  className="aspect-[9/16] rounded-lg overflow-hidden bg-white/5 relative"
                >
                  {p.thumbnail_url || p.media_urls?.[0] ? (
                    <img
                      src={p.thumbnail_url || p.media_urls[0]}
                      alt={p.title || ''}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20" />
                  )}
                  <div className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1 rounded flex items-center gap-0.5">
                    <Eye className="w-3 h-3" /> {p.view_count || 0}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (detailPane === 'tip_earnings') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Tip / cashback earnings</h2>
            <span className="text-violet-300 font-bold">{formatNgn(tipEarnings)}</span>
          </div>
          <p className="text-xs text-white/50">{periodLabel}</p>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-end gap-1 h-24">
              {[40, 65, 30, 80, 55, 90, 45].map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t ${tipEarnings > 0 ? 'bg-emerald-400/80' : 'bg-red-400/50'}`}
                  style={{ height: `${tipEarnings > 0 ? h : 15}%` }}
                />
              ))}
            </div>
            <p className="text-xs text-white/40 mt-2">
              {tipEarnings > 0 ? (
                <span className="text-emerald-400">↑ Earnings in this period</span>
              ) : (
                <span className="text-red-400">↓ No cashback in this period</span>
              )}
            </p>
          </div>
          <div className="space-y-2">
            {starSpendRows.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-8">No tip cashback yet</p>
            ) : (
              starSpendRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                  <div>
                    <p className="text-sm text-white font-medium">{r.label}</p>
                    <p className="text-[11px] text-white/40">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-300">+{formatNgn(Number(r.amount || 0))}</p>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    if (detailPane === 'engagements') {
      return (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Engagements given</h2>
          <p className="text-xs text-white/50">{periodLabel}</p>
          <div className="grid grid-cols-1 gap-3">
            {[
              { label: 'Following', value: followCount, hint: 'Accounts you follow' },
              { label: 'Likes', value: likeCount, hint: 'Posts you reacted to' },
              { label: 'Comments', value: commentCount, hint: 'Comments you posted' },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{row.label}</p>
                  <p className="text-xs text-white/40">{row.hint}</p>
                </div>
                <p className="text-xl font-bold text-violet-300">{row.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/35">
            Engagement earnings unlock later under the Monetization program.
          </p>
        </div>
      );
    }

    if (detailPane === 'stars_spent') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Stars spent</h2>
            <span className="text-amber-300 font-bold">⭐ {starsSpent}</span>
          </div>
          <p className="text-xs text-white/50">{periodLabel}</p>
          <div className="space-y-2">
            {starSpendRows.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-8">No star spend in this period</p>
            ) : (
              starSpendRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                  <div>
                    <p className="text-sm text-white font-medium">{r.label}</p>
                    <p className="text-[11px] text-white/40">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</p>
                  </div>
                  <p className="text-sm font-bold text-amber-300">-⭐{r.stars}</p>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="text-center py-16 space-y-2">
        <LineChart className="w-10 h-10 mx-auto text-white/30" />
        <p className="text-white/50 text-sm">Select a metric from Overview to see details</p>
        <Button size="sm" variant="secondary" onClick={() => setHeaderTab('overview')}>
          Back to Overview
        </Button>
      </div>
    );
  };

  // ——— Viewer Overview (matches design) ———
  const renderViewerOverview = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-violet-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Viewer Overview</h2>
            <p className="text-[11px] text-white/45">Your activity and rewards at a glance.</p>
          </div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPeriodOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            {periodLabel}
            <span className="text-white/40">▾</span>
          </button>
          {periodOpen && (
            <div className="absolute right-0 mt-1 z-20 w-40 rounded-xl border border-white/10 bg-[#1a1b3a] shadow-xl overflow-hidden">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-white/10 ${period === p.key ? 'text-violet-300' : 'text-white/70'}`}
                  onClick={() => {
                    setPeriod(p.key);
                    setPeriodOpen(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Eye} label="Post Viewed" value={postsViewed} delta={postsViewedDelta} onClick={() => openDetail('posts_viewed')} />
        <StatTile icon={Wallet} label="Tip Earnings" value={formatNgn(tipEarnings)} delta={tipDelta} onClick={() => openDetail('tip_earnings')} />
        <StatTile icon={Heart} label="Engagements Given" value={engagements} delta={engagementsDelta} onClick={() => openDetail('engagements')} />
        <StatTile icon={Star} label="Stars Spent" value={starsSpent} delta={starsSpentDelta} onClick={() => openDetail('stars_spent')} />
      </div>

      {/* My Reward Wallet */}
      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 space-y-3">
        <button
          type="button"
          onClick={() => navigate('/wallet')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Wallet className="w-4.5 h-4.5 text-violet-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">My Reward Wallet</p>
              <p className="text-[11px] text-white/45">Manage your rewards and earnings.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </button>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 p-3 text-white">
            <p className="text-[10px] text-white/80 flex items-center gap-1">
              Available to withdraw <span className="opacity-70">ⓘ</span>
            </p>
            <p className="text-xl font-bold mt-1">{formatNgn(available)}</p>
            <button
              type="button"
              onClick={() => navigate('/wallet')}
              className="mt-2 w-full text-[10px] font-semibold bg-white/15 hover:bg-white/25 rounded-lg py-1.5"
            >
              {verifyLevel < 2 ? 'Account Verification Required' : 'Withdraw'} ›
            </button>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="w-7 h-7 rounded-full bg-sky-500/20 flex items-center justify-center mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-sky-300" />
            </div>
            <p className="text-[10px] text-white/45">Pending cashback</p>
            <p className="text-sm font-bold text-white">{formatNgn(pendingCashback)}</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center mb-1">
              <Gift className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <p className="text-[10px] text-white/45">Lifetime rewards</p>
            <p className="text-sm font-bold text-white">{formatNgn(lifetimeRewards)}</p>
          </div>
        </div>

        {verifyLevel < 2 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90">
              All earnings are pending. Verify your identity to start withdrawing.
            </p>
          </div>
        )}
      </div>

      {/* Earn More Stars */}
      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-violet-300" />
            <p className="text-sm font-bold text-white">Earn More Stars</p>
          </div>
          <button type="button" onClick={() => navigate('/tasks')} className="text-xs text-violet-300">
            See all ›
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: PlayCircle, label: 'Rewarded ads', sub: 'Watch & earn', to: '/tasks' },
            { icon: CalendarCheck, label: 'Daily check-in', sub: 'Claim daily', to: '/tasks' },
            { icon: Users, label: 'Invite friends', sub: 'Earn together', to: '/tasks' },
            { icon: Flag, label: 'Sponsored missions', sub: 'Complete tasks', to: '/tasks' },
          ].map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => navigate(c.to)}
              className="rounded-xl bg-white/5 border border-white/10 p-2 text-left hover:border-violet-500/40"
            >
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center mb-1.5">
                <c.icon className="w-4 h-4 text-violet-300" />
              </div>
              <p className="text-[10px] font-semibold text-white leading-tight">{c.label}</p>
              <p className="text-[9px] text-white/40">{c.sub}</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigate('/tasks')}
          className="w-full flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 border border-violet-500/30 px-3 py-3"
        >
          <span className="text-lg">🎁</span>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-white">Tasks</p>
            <p className="text-[11px] text-white/50">Complete tasks to earn Stars</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Verification Level */}
      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-300" />
            <div>
              <p className="text-sm font-bold text-white">Verification Level</p>
              <p className="text-[11px] text-white/45">Complete verification steps to unlock higher rewards.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-600 text-white"
          >
            Level {Math.min(Math.max(verifyLevel, 0), 3) || 1} of 3 ›
          </button>
        </div>
        <div className="flex items-center justify-between px-1">
          {[
            { n: 1, label: 'Basic Info' },
            { n: 2, label: 'ID Verification' },
            { n: 3, label: 'Advanced' },
          ].map((step, i) => {
            const done = verifyLevel >= step.n;
            const current = verifyLevel + 1 === step.n || (verifyLevel === 0 && step.n === 1);
            return (
              <React.Fragment key={step.n}>
                <div className="flex flex-col items-center gap-1 min-w-[4.5rem]">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                      done
                        ? 'bg-violet-600 border-violet-400 text-white'
                        : current
                        ? 'bg-violet-600/80 border-violet-400 text-white'
                        : 'bg-white/5 border-white/15 text-white/40'
                    }`}
                  >
                    {done ? '✓' : step.n}
                  </div>
                  <p className={`text-[10px] ${done || current ? 'text-white/80' : 'text-white/35'}`}>{step.label}</p>
                  {!done && step.n > 1 && <span className="text-[9px] text-white/30">🔒</span>}
                </div>
                {i < 2 && <div className={`flex-1 h-0.5 mx-1 ${verifyLevel > step.n ? 'bg-violet-500' : 'bg-white/10'}`} />}
              </React.Fragment>
            );
          })}
        </div>
        {verifyLevel < 2 && (
          <p className="text-[11px] text-white/50">
            Next: complete Level {verifyLevel < 1 ? 1 : 2} —{' '}
            {verifyLevel < 1
              ? 'email, profile (name, DOB, address, photo), accept terms.'
              : 'identity verification & payout account checks.'}
          </p>
        )}
      </div>

      {/* Earning Status */}
      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban className="w-4 h-4 text-red-400" />
          <div>
            <p className="text-sm font-bold text-white">Earning Status</p>
            <p className="text-[11px] text-white/45">
              {earningStatus === 'not_verified'
                ? "You can't receive earnings until you verify your identity."
                : earningStatus === 'active'
                ? 'You are eligible to earn rewards.'
                : earningStatus === 'paused'
                ? 'Earning is temporarily paused.'
                : earningStatus === 'suspended'
                ? 'Account suspended — contact support.'
                : 'Account banned from earning.'}
            </p>
          </div>
        </div>
        <EarningStatusBadge />
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0b0c1a] text-white pb-24">
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Role tabs: Viewer | Creator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => { setRoleTab('viewer'); setHeaderTab('overview'); setDetailPane(null); }}
              className={`text-lg font-bold pb-1 border-b-2 transition-colors ${
                roleTab === 'viewer' ? 'text-white border-violet-500' : 'text-white/40 border-transparent'
              }`}
            >
              Viewer
            </button>
            <button
              type="button"
              onClick={() => { setRoleTab('creator'); setHeaderTab('overview'); setDetailPane(null); }}
              className={`text-lg font-bold pb-1 border-b-2 transition-colors ${
                roleTab === 'creator' ? 'text-white border-violet-500' : 'text-white/40 border-transparent'
              }`}
            >
              Creator
            </button>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center text-white/60"
            onClick={() => toast({ title: 'Dashboard help', description: 'Overview shows your stats. Details opens each metric. Ad Promotions manages boosts.' })}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Header tabs */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
          {([
            { key: 'overview' as const, icon: LayoutGrid, label: 'Overview' },
            { key: 'details' as const, icon: LineChart, label: 'Details' },
            { key: 'ads' as const, icon: Megaphone, label: 'Ad Promotions' },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setHeaderTab(t.key);
                if (t.key === 'overview') setDetailPane(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors ${
                headerTab === t.key ? 'bg-violet-600 text-white shadow' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {loading && roleTab === 'viewer' && headerTab === 'overview' ? (
          <div className="py-20 text-center text-white/40 text-sm">Loading dashboard…</div>
        ) : null}

        {/* VIEWER */}
        {roleTab === 'viewer' && headerTab === 'overview' && renderViewerOverview()}
        {roleTab === 'viewer' && headerTab === 'details' && renderViewerDetails()}
        {roleTab === 'viewer' && headerTab === 'ads' && (
          <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 py-16 text-center">
            <Megaphone className="w-10 h-10 mx-auto text-white/30 mb-2" />
            <p className="text-white/50 text-sm">Ad Promotions</p>
            <p className="text-xs text-white/35 mt-1">Viewer ad tools coming soon</p>
          </div>
        )}

        {/* CREATOR (existing structure, themed) */}
        {roleTab === 'creator' && headerTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Eye} label="Total Views" value={creatorStats.totalViews} />
              <StatTile icon={Wallet} label="Wallet" value={formatNgn(creatorStats.totalEarnings)} onClick={() => navigate('/creator-earnings')} />
              <StatTile icon={Users} label="Followers" value={creatorStats.followerCount} />
              <StatTile icon={Heart} label="Reactions" value={creatorStats.totalReactions} />
            </div>
            {user?.id && <CreatorMonetizationCard userId={user.id} />}
            <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4">
              <p className="text-sm font-bold text-white mb-2">Withdrawal</p>
              {user?.id && <WithdrawalForm userId={user.id} />}
            </div>
            <Button variant="secondary" className="w-full" onClick={() => navigate('/creator-earnings')}>
              Full earnings breakdown
            </Button>
          </div>
        )}
        {roleTab === 'creator' && headerTab === 'details' && (
          <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-2">
            <CreatorAnalytics />
          </div>
        )}
        {roleTab === 'creator' && headerTab === 'ads' && (
          <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 py-16 text-center">
            <Megaphone className="w-10 h-10 mx-auto text-white/30 mb-2" />
            <p className="text-white/50 text-sm">Ad Promotions is coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorDashboard;

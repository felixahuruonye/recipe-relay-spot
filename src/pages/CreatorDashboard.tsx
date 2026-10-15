import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutGrid, LineChart, Megaphone, Eye, Wallet, Heart, Star,
  ChevronRight, ChevronLeft, Gift, PlayCircle, CalendarCheck, Users, Flag,
  Shield, HelpCircle, AlertTriangle, Ban, Pause, CheckCircle2, CircleDot,
  MessageCircle, UserPlus, TrendingUp, TrendingDown, Loader2
} from 'lucide-react';
import { CreatorMonetizationCard } from '@/components/Profile/CreatorMonetizationCard';
import { WithdrawalForm } from '@/components/Profile/WithdrawalForm';
import { CreatorAnalytics } from '@/components/Profile/CreatorAnalytics';
import { useToast } from '@/hooks/use-toast';
import { VerificationPanel, type VerifyInfo } from '@/components/Profile/VerificationPanel';

type RoleTab = 'viewer' | 'creator';
type HeaderTab = 'overview' | 'details' | 'ads';
type DetailPane = 'posts_viewed' | 'tip_earnings' | 'engagements' | 'stars_spent' | null;
type PeriodKey = '7d' | '14d' | '30d' | '90d' | 'custom';

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '14d', label: 'Last 14 days', days: 14 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range', days: null },
];

const formatNgn = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n || 0);

const pctChange = (current: number, previous: number): number | null => {
  if (previous <= 0 && current <= 0) return 0;
  if (previous <= 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
};

const dayKey = (iso: string) => {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const CreatorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [roleTab, setRoleTab] = useState<RoleTab>('viewer');
  const [headerTab, setHeaderTab] = useState<HeaderTab>('overview');
  const [detailPane, setDetailPane] = useState<DetailPane>(null);
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);

  const [postsViewed, setPostsViewed] = useState(0);
  const [postsViewedDelta, setPostsViewedDelta] = useState<number | null>(null);
  const [tipEarnings, setTipEarnings] = useState(0);
  const [tipDelta, setTipDelta] = useState<number | null>(null);
  const [engagements, setEngagements] = useState(0);
  const [engagementsDelta, setEngagementsDelta] = useState<number | null>(null);
  const [starsSpent, setStarsSpent] = useState(0);
  const [starsSpentDelta, setStarsSpentDelta] = useState<number | null>(null);

  const [available, setAvailable] = useState(0);
  const [pendingCashback, setPendingCashback] = useState(0);
  const [lifetimeRewards, setLifetimeRewards] = useState(0);

  const [verifyLevel, setVerifyLevel] = useState(0);
  const [earningStatus, setEarningStatus] = useState<'active' | 'paused' | 'suspended' | 'banned' | 'not_verified'>('not_verified');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState<VerifyInfo>({
    level: 0, status: 'NOT_STARTED', earningStatus: 'not_verified', hasAvatar: false, termsAccepted: false,
  });

  const [viewedPosts, setViewedPosts] = useState<{ post: any; times: number; lastAt?: string }[]>([]);
  const [starSpendRows, setStarSpendRows] = useState<any[]>([]);
  const [tipSeries, setTipSeries] = useState<{ day: string; amount: number }[]>([]);
  const [followCount, setFollowCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);

  const [creatorStats, setCreatorStats] = useState({
    totalViews: 0,
    totalEarnings: 0,
    followerCount: 0,
    postCount: 0,
    totalReactions: 0,
  });

  const range = useMemo(() => {
    const now = new Date();
    if (period === 'custom' && customFrom && customTo) {
      const from = new Date(customFrom);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      const ms = Math.max(0, to.getTime() - from.getTime());
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - ms);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        prevFrom: prevFrom.toISOString(),
        prevTo: prevTo.toISOString(),
      };
    }
    const p = PERIODS.find((x) => x.key === period);
    const days = p?.days ?? 7;
    const to = now;
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - days);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      prevTo: prevTo.toISOString(),
    };
  }, [period, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) return `${customFrom} → ${customTo}`;
    return PERIODS.find((p) => p.key === period)?.label || 'Last 7 days';
  }, [period, customFrom, customTo]);

  const loadViewerStats = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const uid = user.id;
      const { from, to, prevFrom, prevTo } = range;

      const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle();
      if (profile) {
        setAvailable(Number((profile as any).wallet_balance || 0));
        setPendingCashback(Number((profile as any).pending_tip_earnings || 0));
        setLifetimeRewards(
          Number((profile as any).total_earned || 0) + Number((profile as any).pending_tip_earnings || 0)
        );
        const lvl = Number((profile as any).verification_level ?? (profile as any).verify_level ?? 0);
        setVerifyLevel(Number.isFinite(lvl) ? lvl : 0);
        const vStatus = String((profile as any).verification_status || 'NOT_STARTED').toUpperCase();
        const status = String((profile as any).earning_status || (profile as any).account_status || '').toLowerCase();
        if (status.includes('ban')) setEarningStatus('banned');
        else if (status.includes('suspend')) setEarningStatus('suspended');
        else if (status.includes('pause')) setEarningStatus('paused');
        else if (lvl >= 2 && vStatus === 'VERIFIED') setEarningStatus('active');
        else setEarningStatus('not_verified');
        const avatar = (profile as any).avatar_url || '';
        setVerifyInfo({
          level: Number.isFinite(lvl) ? lvl : 0,
          status: vStatus || 'NOT_STARTED',
          earningStatus: status || 'not_verified',
          fullName: (profile as any).full_name,
          dateOfBirth: (profile as any).date_of_birth,
          addressLine: (profile as any).address_line,
          city: (profile as any).city,
          stateRegion: (profile as any).state_region,
          country: (profile as any).country,
          phone: (profile as any).phone,
          avatarUrl: avatar,
          hasAvatar: !!(avatar && String(avatar).trim()),
          termsAccepted: !!(profile as any).terms_rewards_accepted_at,
        });
      }

      // ---- post views (current + previous window) ----
      const fetchViews = async (a: string, b: string) => {
        const tryTables = ['post_views', 'post_view_events'];
        for (const table of tryTables) {
          const res = await (supabase as any)
            .from(table)
            .select('post_id, created_at')
            .eq('user_id', uid)
            .gte('created_at', a)
            .lte('created_at', b)
            .limit(1000);
          if (!res.error) return (res.data || []) as any[];
        }
        return [] as any[];
      };

      const [curViews, prevViews] = await Promise.all([fetchViews(from, to), fetchViews(prevFrom, prevTo)]);
      setPostsViewed(curViews.length);
      setPostsViewedDelta(pctChange(curViews.length, prevViews.length));

      const timesMap = new Map<string, { times: number; lastAt: string }>();
      curViews.forEach((r: any) => {
        if (!r.post_id) return;
        const prev = timesMap.get(r.post_id);
        const at = r.created_at || '';
        if (!prev) timesMap.set(r.post_id, { times: 1, lastAt: at });
        else timesMap.set(r.post_id, { times: prev.times + 1, lastAt: at > prev.lastAt ? at : prev.lastAt });
      });
      const ids = [...timesMap.keys()].slice(0, 80);
      if (ids.length) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id, title, media_urls, thumbnail_url, media_type, view_count')
          .in('id', ids);
        const list = (posts || []).map((p: any) => ({
          post: p,
          times: timesMap.get(p.id)?.times || 1,
          lastAt: timesMap.get(p.id)?.lastAt,
        }));
        list.sort((a, b) => b.times - a.times);
        setViewedPosts(list);
      } else {
        setViewedPosts([]);
      }

      // ---- tips / cashback as viewer ----
      const fetchTips = async (a: string, b: string) => {
        const res = await (supabase as any)
          .from('tip_ledger')
          .select('id, viewer_ngn, stars, created_at, post_id, source')
          .eq('from_user_id', uid)
          .gte('created_at', a)
          .lte('created_at', b)
          .order('created_at', { ascending: false })
          .limit(300);
        if (res.error) return [] as any[];
        return res.data || [];
      };
      const [curTips, prevTips] = await Promise.all([fetchTips(from, to), fetchTips(prevFrom, prevTo)]);
      const tipSum = curTips.reduce((s: number, t: any) => s + Number(t.viewer_ngn || 0), 0);
      const prevTipSum = prevTips.reduce((s: number, t: any) => s + Number(t.viewer_ngn || 0), 0);
      setTipEarnings(tipSum);
      setTipDelta(pctChange(tipSum, prevTipSum));

      const seriesMap = new Map<string, number>();
      curTips.forEach((t: any) => {
        const k = dayKey(t.created_at);
        if (!k) return;
        seriesMap.set(k, (seriesMap.get(k) || 0) + Number(t.viewer_ngn || 0));
      });
      const series = [...seriesMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, amount]) => ({ day, amount }));
      setTipSeries(series);

      const starsSum = curTips.reduce((s: number, t: any) => s + Number(t.stars || 0), 0);
      const prevStarsSum = prevTips.reduce((s: number, t: any) => s + Number(t.stars || 0), 0);
      setStarsSpent(starsSum);
      setStarsSpentDelta(pctChange(starsSum, prevStarsSum));

      // merge wallet_history star spends if table allows
      let walletSpends: any[] = [];
      try {
        const wh = await (supabase as any)
          .from('wallet_history')
          .select('id, type, amount, created_at, meta')
          .eq('user_id', uid)
          .gte('created_at', from)
          .lte('created_at', to)
          .order('created_at', { ascending: false })
          .limit(100);
        if (!wh.error && wh.data) {
          walletSpends = (wh.data as any[]).filter((r) =>
            String(r.type || '').toLowerCase().includes('star') ||
            String(r.meta?.label || '').toLowerCase().includes('star')
          );
        }
      } catch { /* ignore */ }

      const spendRows = [
        ...curTips.map((t: any) => ({
          id: `tip-${t.id || t.created_at}`,
          stars: Number(t.stars || 0),
          amount: Number(t.viewer_ngn || 0),
          created_at: t.created_at,
          label: t.source === 'auto' ? `Auto-spend tip ⭐${t.stars}` : `Tip ⭐${t.stars}`,
          kind: 'tip' as const,
        })),
        ...walletSpends.map((r: any) => ({
          id: `wh-${r.id}`,
          stars: Math.abs(Number(r.amount || 0)),
          amount: 0,
          created_at: r.created_at,
          label: r.meta?.label || r.type || 'Star spend',
          kind: 'other' as const,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setStarSpendRows(spendRows);

      // ---- engagements ----
      const countRows = async (table: string, col: string, a: string, b: string) => {
        const res = await (supabase as any)
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq(col, uid)
          .gte('created_at', a)
          .lte('created_at', b);
        if (res.error) return 0;
        return res.count || 0;
      };

      const [lc, cc, fc, plc, pcc, pfc] = await Promise.all([
        countRows('post_likes', 'user_id', from, to),
        countRows('comments', 'user_id', from, to),
        countRows('followers', 'follower_id', from, to),
        countRows('post_likes', 'user_id', prevFrom, prevTo),
        countRows('comments', 'user_id', prevFrom, prevTo),
        countRows('followers', 'follower_id', prevFrom, prevTo),
      ]);
      setLikeCount(lc);
      setCommentCount(cc);
      setFollowCount(fc);
      const eng = lc + cc + fc;
      const prevEng = plc + pcc + pfc;
      setEngagements(eng);
      setEngagementsDelta(pctChange(eng, prevEng));
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Could not load dashboard', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, range, toast]);

  const loadCreatorStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('follower_count, post_count, wallet_balance, total_reactions')
        .eq('id', user.id)
        .single();
      const { data: postsData } = await supabase.from('posts').select('id, view_count').eq('user_id', user.id);
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
  }, [user?.id, roleTab, period, customFrom, customTo, loadViewerStats, loadCreatorStats]);

  const openDetail = (pane: DetailPane) => {
    setDetailPane(pane);
    setHeaderTab('details');
  };

  const Delta = ({ value }: { value: number | null }) => {
    if (value === null || value === undefined) return <span className="text-xs text-white/40">—</span>;
    const up = value >= 0;
    return (
      <span className={`text-xs font-medium inline-flex items-center gap-0.5 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {Math.abs(value)}%
      </span>
    );
  };

  const PeriodPicker = () => (
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
        <div className="absolute right-0 mt-1 z-30 w-52 rounded-xl border border-white/10 bg-[#1a1b3a] shadow-xl overflow-hidden">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs hover:bg-white/10 ${period === p.key ? 'text-violet-300' : 'text-white/70'}`}
              onClick={() => {
                setPeriod(p.key);
                if (p.key !== 'custom') setPeriodOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="p-3 border-t border-white/10 space-y-2">
              <label className="text-[10px] text-white/50 block">From
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="mt-0.5 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" />
              </label>
              <label className="text-[10px] text-white/50 block">To
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="mt-0.5 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-xs text-white" />
              </label>
              <Button size="sm" className="w-full h-7 text-xs" disabled={!customFrom || !customTo}
                onClick={() => setPeriodOpen(false)}>
                Apply
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const StatTile = ({
    icon: Icon, label, value, delta, onClick,
  }: { icon: any; label: string; value: string | number; delta?: number | null; onClick?: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="relative text-left rounded-2xl p-4 bg-[#1a1b3a]/90 border border-white/10 hover:border-violet-500/40 transition-colors shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-violet-300" />
        </div>
        <ChevronRight className="w-4 h-4 text-white/40" />
      </div>
      <p className="mt-3 text-xs text-white/50 font-medium">{label}</p>
      <p className="text-2xl font-bold text-white tracking-tight mt-0.5">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <div className="mt-1"><Delta value={delta ?? null} /></div>
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

  const DetailChips = () => (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {([
        { key: 'posts_viewed' as const, label: 'Posts viewed', icon: Eye },
        { key: 'tip_earnings' as const, label: 'Tip earnings', icon: Wallet },
        { key: 'engagements' as const, label: 'Engagements', icon: Heart },
        { key: 'stars_spent' as const, label: 'Stars spent', icon: Star },
      ]).map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setDetailPane(c.key)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            detailPane === c.key
              ? 'bg-violet-600 border-violet-400 text-white'
              : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
          }`}
        >
          <c.icon className="w-3.5 h-3.5" />
          {c.label}
        </button>
      ))}
    </div>
  );

  const MiniBarChart = ({ data, positive }: { data: { day: string; amount: number }[]; positive: boolean }) => {
    if (!data.length) {
      return (
        <div className="h-28 flex items-center justify-center text-xs text-white/35">No data in this period</div>
      );
    }
    const max = Math.max(...data.map((d) => d.amount), 1);
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-end gap-1 h-28">
          {data.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className={`w-full rounded-t ${positive ? 'bg-emerald-400/85' : 'bg-red-400/70'}`}
                style={{ height: `${Math.max(6, (d.amount / max) * 100)}%` }}
                title={`${d.day}: ${formatNgn(d.amount)}`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[9px] text-white/35">
          <span>{data[0]?.day?.slice(5)}</span>
          <span>{data[data.length - 1]?.day?.slice(5)}</span>
        </div>
      </div>
    );
  };

  const renderViewerDetails = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => { setHeaderTab('overview'); setDetailPane(null); }}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white"
        >
          <ChevronLeft className="w-4 h-4" /> Overview
        </button>
        <PeriodPicker />
      </div>
      <DetailChips />

      {!detailPane && (
        <div className="text-center py-14 space-y-2">
          <LineChart className="w-10 h-10 mx-auto text-white/30" />
          <p className="text-white/50 text-sm">Choose a metric above</p>
          <p className="text-xs text-white/35">Or tap a card on Overview</p>
        </div>
      )}

      {detailPane === 'posts_viewed' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Posts viewed</h2>
            <Badge className="bg-violet-600/40 text-violet-100 border-0">{postsViewed} views</Badge>
          </div>
          <p className="text-xs text-white/50 flex items-center gap-2">
            {periodLabel}
            <Delta value={postsViewedDelta} />
          </p>
          <p className="text-[11px] text-white/40">
            {viewedPosts.length} unique posts · tap to open in feed
          </p>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>
          ) : viewedPosts.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-12">No viewed posts in this period</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {viewedPosts.map(({ post: p, times, lastAt }) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/?post=${encodeURIComponent(p.id)}`)}
                  className="aspect-[9/16] rounded-lg overflow-hidden bg-white/5 relative group"
                >
                  {p.thumbnail_url || p.media_urls?.[0] ? (
                    <img src={p.thumbnail_url || p.media_urls[0]} alt={p.title || ''} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-600/30 to-fuchsia-600/20" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                    <p className="text-[9px] text-white/90 line-clamp-1">{p.title}</p>
                    <div className="flex items-center justify-between text-[9px] text-white/70 mt-0.5">
                      <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{times}×</span>
                      {lastAt && <span>{new Date(lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {detailPane === 'tip_earnings' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Tip / cashback earnings</h2>
            <span className="text-violet-300 font-bold">{formatNgn(tipEarnings)}</span>
          </div>
          <p className="text-xs text-white/50 flex items-center gap-2">
            {periodLabel}
            <Delta value={tipDelta} />
          </p>
          <MiniBarChart data={tipSeries} positive={tipEarnings > 0 && (tipDelta === null || tipDelta >= 0)} />
          <div className="space-y-2">
            {starSpendRows.filter((r) => r.kind === 'tip').length === 0 ? (
              <p className="text-sm text-white/40 text-center py-8">No cashback in this period</p>
            ) : (
              starSpendRows.filter((r) => r.kind === 'tip').map((r) => (
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
      )}

      {detailPane === 'engagements' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Engagements given</h2>
            <Badge className="bg-violet-600/40 text-violet-100 border-0">{engagements}</Badge>
          </div>
          <p className="text-xs text-white/50 flex items-center gap-2">
            {periodLabel}
            <Delta value={engagementsDelta} />
          </p>
          <div className="grid grid-cols-1 gap-3">
            {[
              { label: 'Following', value: followCount, hint: 'New follows in this period', icon: UserPlus },
              { label: 'Likes', value: likeCount, hint: 'Posts you reacted to', icon: Heart },
              { label: 'Comments', value: commentCount, hint: 'Comments you posted', icon: MessageCircle },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                    <row.icon className="w-5 h-5 text-violet-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{row.label}</p>
                    <p className="text-xs text-white/40">{row.hint}</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-violet-300">{row.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/35">
            Engagement earnings unlock later under the Monetization program.
          </p>
        </div>
      )}

      {detailPane === 'stars_spent' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Stars spent</h2>
            <span className="text-amber-300 font-bold">⭐ {starsSpent}</span>
          </div>
          <p className="text-xs text-white/50 flex items-center gap-2">
            {periodLabel}
            <Delta value={starsSpentDelta} />
          </p>
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
      )}
    </div>
  );

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
        <PeriodPicker />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Eye} label="Post Viewed" value={postsViewed} delta={postsViewedDelta} onClick={() => openDetail('posts_viewed')} />
        <StatTile icon={Wallet} label="Tip Earnings" value={formatNgn(tipEarnings)} delta={tipDelta} onClick={() => openDetail('tip_earnings')} />
        <StatTile icon={Heart} label="Engagements Given" value={engagements} delta={engagementsDelta} onClick={() => openDetail('engagements')} />
        <StatTile icon={Star} label="Stars Spent" value={starsSpent} delta={starsSpentDelta} onClick={() => openDetail('stars_spent')} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 space-y-3">
        <button type="button" onClick={() => navigate('/wallet')} className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-violet-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">My Reward Wallet</p>
              <p className="text-[11px] text-white/45">Manage your rewards and earnings.</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </button>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 p-3 text-white">
            <p className="text-[10px] text-white/80">Available to withdraw ⓘ</p>
            <p className="text-xl font-bold mt-1">{formatNgn(available)}</p>
            <button type="button" onClick={() => navigate('/wallet')}
              className="mt-2 w-full text-[10px] font-semibold bg-white/15 hover:bg-white/25 rounded-lg py-1.5">
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
            <p className="text-[11px] text-amber-200/90">All earnings are pending. Verify your identity to start withdrawing.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-violet-300" />
            <p className="text-sm font-bold text-white">Earn More Stars</p>
          </div>
          <button type="button" onClick={() => navigate('/tasks')} className="text-xs text-violet-300">See all ›</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: PlayCircle, label: 'Rewarded ads', sub: 'Watch & earn', to: '/tasks' },
            { icon: CalendarCheck, label: 'Daily check-in', sub: 'Claim daily', to: '/tasks' },
            { icon: Users, label: 'Invite friends', sub: 'Earn together', to: '/tasks' },
            { icon: Flag, label: 'Sponsored missions', sub: 'Complete tasks', to: '/tasks' },
          ].map((c) => (
            <button key={c.label} type="button" onClick={() => navigate(c.to)}
              className="rounded-xl bg-white/5 border border-white/10 p-2 text-left hover:border-violet-500/40">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center mb-1.5">
                <c.icon className="w-4 h-4 text-violet-300" />
              </div>
              <p className="text-[10px] font-semibold text-white leading-tight">{c.label}</p>
              <p className="text-[9px] text-white/40">{c.sub}</p>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => navigate('/tasks')}
          className="w-full flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-600/30 to-fuchsia-600/20 border border-violet-500/30 px-3 py-3">
          <span className="text-lg">🎁</span>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-white">Tasks</p>
            <p className="text-[11px] text-white/50">Complete tasks to earn Stars</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 space-y-3 cursor-pointer" onClick={() => setVerifyOpen(true)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-300" />
            <div>
              <p className="text-sm font-bold text-white">Verification Level</p>
              <p className="text-[11px] text-white/45">Complete steps to unlock higher rewards.</p>
            </div>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); setVerifyOpen(true); }}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-600 text-white">
            Level {Math.min(Math.max(verifyLevel, 0), 3) || (verifyInfo.status === 'NOT_STARTED' ? 0 : 1)} of 3 ›
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
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                    done || current ? 'bg-violet-600 border-violet-400 text-white' : 'bg-white/5 border-white/15 text-white/40'
                  }`}>
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
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 p-4 flex items-center justify-between cursor-pointer" onClick={() => earningStatus === 'not_verified' && setVerifyOpen(true)}>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button type="button"
              onClick={() => { setRoleTab('viewer'); setHeaderTab('overview'); setDetailPane(null); }}
              className={`text-lg font-bold pb-1 border-b-2 transition-colors ${
                roleTab === 'viewer' ? 'text-white border-violet-500' : 'text-white/40 border-transparent'
              }`}>
              Viewer
            </button>
            <button type="button"
              onClick={() => { setRoleTab('creator'); setHeaderTab('overview'); setDetailPane(null); }}
              className={`text-lg font-bold pb-1 border-b-2 transition-colors ${
                roleTab === 'creator' ? 'text-white border-violet-500' : 'text-white/40 border-transparent'
              }`}>
              Creator
            </button>
          </div>
          <button type="button"
            className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center text-white/60"
            onClick={() => toast({ title: 'Dashboard help', description: 'Overview shows your stats. Details opens each metric. Change the time period anytime to refresh data.' })}>
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
          {([
            { key: 'overview' as const, icon: LayoutGrid, label: 'Overview' },
            { key: 'details' as const, icon: LineChart, label: 'Details' },
            { key: 'ads' as const, icon: Megaphone, label: 'Ad Promotions' },
          ]).map((t) => (
            <button key={t.key} type="button"
              onClick={() => {
                setHeaderTab(t.key);
                if (t.key === 'overview') setDetailPane(null);
                if (t.key === 'details' && !detailPane) setDetailPane('posts_viewed');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-colors ${
                headerTab === t.key ? 'bg-violet-600 text-white shadow' : 'text-white/50 hover:text-white/80'
              }`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {loading && roleTab === 'viewer' && (
          <div className="flex items-center justify-center gap-2 py-6 text-white/40 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Updating {periodLabel}…
          </div>
        )}

        {roleTab === 'viewer' && headerTab === 'overview' && renderViewerOverview()}
        {roleTab === 'viewer' && headerTab === 'details' && renderViewerDetails()}
        {roleTab === 'viewer' && headerTab === 'ads' && (
          <div className="rounded-2xl border border-white/10 bg-[#1a1b3a]/90 py-16 text-center">
            <Megaphone className="w-10 h-10 mx-auto text-white/30 mb-2" />
            <p className="text-white/50 text-sm">Ad Promotions</p>
            <p className="text-xs text-white/35 mt-1">Viewer ad tools coming soon</p>
          </div>
        )}

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

      <VerificationPanel
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        info={verifyInfo}
        onUpdated={() => { setVerifyOpen(false); loadViewerStats(); }}
      />
    </div>
  );
};

export default CreatorDashboard;

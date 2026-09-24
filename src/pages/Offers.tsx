import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Sparkles, Star, Clock, ArrowUpRight, Zap, Flame, Smartphone,
  Target, Globe, Lock, Unlock, ClipboardList, CheckCircle2, Loader2, Wallet, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useTaskEligibility } from '@/hooks/useTaskEligibility';
import { useTaskClick } from '@/hooks/useTaskClick';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getProviderAdapter, EmbedType } from '@/lib/providerAdapters';
import { OfferwallModal } from '@/components/OfferwallModal';

// A network/offerwall task (Monlix, MyLead, CPAGrip, OGAds) — reward is
// calculated server-side by the postback + admin config, never fixed here.
interface NetworkTask {
  source: 'network';
  id: string;
  provider_id: string;
  offer_id: string;
  offer_name: string;
  user_reward_stars: number;
  est_minutes: number;
  url?: string;
  category: 'offers' | 'surveys' | 'content';
  featured?: boolean;
  eligibility: string;
  embedType: EmbedType;
  launchUrlTemplate: string | null;
  isConfigured: boolean;
}

// A Lenory-created internal task (referrals, follows, etc.) — its own
// system (offer_tasks / offer_task_completions), untouched by the
// network provider work.
interface LenoryTask {
  source: 'lenory';
  id: string;
  title: string;
  description: string | null;
  payout_stars: number;
  payout_naira: number;
  est_minutes: number;
  url: string | null;
  category: 'tasks';
  featured: boolean;
}

type UnifiedTask = NetworkTask | LenoryTask;

interface TaskCompletion {
  id: string;
  user_id: string;
  provider_id: string;
  offer_name: string;
  user_reward_stars: number;
  status: string;
  created_at: string;
}

interface AdNetwork {
  provider_id: string;
  display_name: string;
}

const TABS = [
  { id: 'ALL', label: 'All', icon: Zap },
  { id: 'offers', label: 'Offers', icon: Flame },
  { id: 'surveys', label: 'Surveys', icon: ClipboardList },
  { id: 'content', label: 'Content', icon: Lock },
  { id: 'tasks', label: 'Tasks', icon: Target },
];

// Branding only — no longer used for navigation, just the little icon/tint
// on each network task card.
const PROVIDER_BRANDING: Record<string, { label: string; icon: any; tint: string }> = {
  monlix: { label: 'Monlix', icon: Flame, tint: 'from-orange-400 to-red-500' },
  mylead: { label: 'MyLead', icon: ClipboardList, tint: 'from-yellow-400 to-amber-500' },
  cpagrip: { label: 'CPAGrip', icon: Lock, tint: 'from-pink-400 to-rose-500' },
  ogads: { label: 'OGAds', icon: Smartphone, tint: 'from-emerald-400 to-teal-500' },
  monetag: { label: 'Monetag', icon: Globe, tint: 'from-sky-400 to-indigo-500' },
};

const providerMeta = (id: string) =>
  PROVIDER_BRANDING[id?.toLowerCase()] || { label: id, icon: Gift, tint: 'from-primary to-fuchsia-500' };

// Matches the spec's own examples verbatim: Monlix (offers) -> "Complete a
// task", MyLead (surveys) -> "Complete an opportunity", lockers -> "Unlock Content".
const categoryActionTitle = (category: string) => {
  if (category === 'surveys') return 'Complete an opportunity';
  if (category === 'content') return 'Unlock Content';
  return 'Complete a task';
};

type TaskStatus = 'started' | 'pending' | 'completed';

const Offers: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const eligibility = useTaskEligibility();
  const { recordClick } = useTaskClick();

  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [adNetworks, setAdNetworks] = useState<AdNetwork[]>([]);
  const [selected, setSelected] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [wallet, setWallet] = useState(0);
  const [todayStars, setTodayStars] = useState(0);
  const [pendingStars, setPendingStars] = useState(0);
  const [liveFeed, setLiveFeed] = useState<TaskCompletion[]>([]);
  const [tickIndex, setTickIndex] = useState(0);
  const [myStatus, setMyStatus] = useState<Record<string, TaskStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeOfferwall, setActiveOfferwall] = useState<{ url: string; label: string; isLocker: boolean } | null>(null);
  const startedAt = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!user || !eligibility || eligibility.isLoading) return;
    supabase.from('task_rules_acceptance').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (!data) navigate('/task-rules', { replace: true }); });
  }, [user?.id, navigate, eligibility?.isLoading]);

  useEffect(() => {
    loadTasks();
    loadLiveFeed();
    const channel = supabase
      .channel('offer-live-feed')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'task_ledger' },
        (payload: any) => {
          if (payload.new?.status === 'approved') {
            setLiveFeed((prev) => [payload.new as TaskCompletion, ...prev].slice(0, 20));
          }
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offer_tasks' }, loadTasks)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!user) return;
    loadBalance();
    loadMyStatus();
    const channel = supabase
      .channel(`offer-balance-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${user.id}` },
        (payload: any) => {
          setStars(payload.new?.star_balance ?? 0);
          setWallet(Number(payload.new?.wallet_balance ?? 0));
          setPendingStars(payload.new?.task_balance_pending ?? 0);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    if (liveFeed.length < 2) return;
    const t = setInterval(() => setTickIndex((i) => (i + 1) % liveFeed.length), 3200);
    return () => clearInterval(t);
  }, [liveFeed.length]);

  const loadTasks = async () => {
    try {
      const [{ data: previewTasks, error: previewError }, { data: lenoryRaw }] = await Promise.all([
        // Server-calculated preview — the browser never does reward math
        // itself. Same formula process_task_postback() uses for real.
        supabase.rpc('get_available_tasks' as any),
        supabase.from('offer_tasks' as any).select('*').eq('active', true).order('featured', { ascending: false }),
      ]);
      if (previewError) throw previewError;

      const networkTasks: NetworkTask[] = ((previewTasks as any[]) || []).map((p) => {
        const offerId = `${p.provider_id}-preview-offer`;
        return {
          source: 'network',
          id: offerId,
          provider_id: p.provider_id,
          offer_id: offerId,
          offer_name: categoryActionTitle(p.category),
          user_reward_stars: p.preview_reward_stars,
          est_minutes: 5,
          category: (p.category || 'offers') as NetworkTask['category'],
          featured: p.featured || false,
          eligibility: `${p.min_age}+${p.country_availability?.length ? ' · ' + p.country_availability.join(', ') : ' · Worldwide'}`,
          embedType: (p.embed_type || 'link') as EmbedType,
          launchUrlTemplate: p.launch_url_template || null,
          isConfigured: !!p.launch_url_template,
        };
      });

      const lenoryTasks: LenoryTask[] = ((lenoryRaw as any[]) || []).map((t) => ({
        source: 'lenory',
        id: t.id,
        title: t.title,
        description: t.description,
        payout_stars: t.payout_stars,
        payout_naira: t.payout_naira,
        est_minutes: t.est_minutes,
        url: t.url,
        category: 'tasks',
        featured: t.featured,
      }));

      setTasks([...networkTasks, ...lenoryTasks]);

      const { data: ads } = await supabase
        .from('task_provider_config')
        .select('provider_id, display_name')
        .eq('category', 'advertising')
        .eq('enabled', true);
      setAdNetworks((ads as AdNetwork[]) || []);

      setLoading(false);
    } catch (error) {
      console.error('Error loading tasks:', error);
      setLoading(false);
    }
  };

  const loadLiveFeed = async () => {
    try {
      const { data } = await supabase
        .from('task_ledger')
        .select('id, user_id, provider_id, offer_name, user_reward_stars, status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(20);
      setLiveFeed(((data as any[]) || []) as TaskCompletion[]);
    } catch (error) {
      console.error('Error loading live feed:', error);
    }
  };

  const loadBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('star_balance, wallet_balance, task_balance_pending')
      .eq('id', user.id)
      .maybeSingle();
    setStars(data?.star_balance ?? 0);
    setWallet(Number(data?.wallet_balance ?? 0));
    setPendingStars(data?.task_balance_pending ?? 0);
  };

  const loadMyStatus = async () => {
    if (!user) return;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

    const [{ data: ledgerRows }, { data: lenoryRows }] = await Promise.all([
      supabase
        .from('task_ledger')
        .select('offer_id, status, user_reward_stars, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('offer_task_completions' as any)
        .select('task_id, status, stars_credited, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const map: Record<string, TaskStatus> = {};
    let today = 0;

    ((ledgerRows as any[]) || []).forEach((row) => {
      const key = row.offer_id;
      if (key && !map[key]) {
        if (row.status === 'approved' || row.status === 'available') map[key] = 'completed';
        else if (row.status === 'pending') map[key] = 'pending';
        else if (row.status === 'clicked') map[key] = 'started';
      }
      if ((row.status === 'approved' || row.status === 'available') && row.created_at >= since) {
        today += row.user_reward_stars || 0;
      }
    });

    ((lenoryRows as any[]) || []).forEach((row) => {
      const key = row.task_id;
      if (key && !map[key] && (row.status === 'started' || row.status === 'completed')) {
        map[key] = row.status;
      }
      if (row.status === 'completed' && row.created_at >= since) today += row.stars_credited || 0;
    });

    setMyStatus(map);
    setTodayStars(today);
  };

  const loadTaskHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      // RLS already scopes this to the caller's own rows.
      const { data, error } = await supabase
        .from('task_ledger')
        .select('id, provider_id, offer_name, provider_payout_usd, user_reward_stars, status, created_at, approved_at, reversed_at, reversal_reason')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      setHistoryRows(data || []);
    } catch (error) {
      console.error('Error loading task balance history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) loadTaskHistory();
  };

  const filtered = useMemo(
    () => (selected === 'ALL' ? tasks : tasks.filter((t) => t.category === selected)),
    [tasks, selected],
  );

  // Spec's "🔥 Available for You" / "More opportunities" split — featured
  // network tasks (and all Lenory tasks) lead, the rest trail below.
  const featuredList = useMemo(
    () => filtered.filter((t) => t.featured || t.source === 'lenory'),
    [filtered],
  );
  const moreList = useMemo(
    () => filtered.filter((t) => !(t.featured || t.source === 'lenory')),
    [filtered],
  );

  const requireLogin = () => {
    toast({ title: 'Login required', description: 'Sign in to start earning from tasks.' });
    navigate('/auth');
  };

  const handleStart = async (task: UnifiedTask) => {
    if (!user) return requireLogin();

    if (!eligibility.isReady) {
      toast({
        title: 'Profile incomplete',
        description: 'Complete your profile to access tasks',
        variant: 'destructive',
      });
      navigate('/settings');
      return;
    }

    setBusy(task.id);
    try {
      if (task.source === 'lenory') {
        const { data, error } = await supabase.rpc('start_offer_task' as any, { p_task_id: task.id });
        if (error) throw error;
        const res = data as any;
        if (!res?.success) throw new Error(res?.error || 'Could not start task');
        startedAt.current[task.id] = Date.now();
        setMyStatus((prev) => ({ ...prev, [task.id]: 'started' }));
        const target = res.url || task.url;
        if (target) {
          if (target.startsWith('/')) navigate(target);
          else window.open(target, '_blank', 'noopener');
        }
        toast({ title: 'Task started 🚀', description: 'Finish it, then come back and tap Claim.' });
      } else {
        // Never record a click (or fake a link) for a provider the
        // admin hasn't actually connected yet — that would be an
        // earning event with no real economic source behind it.
        if (!task.isConfigured) {
          toast({
            title: `${providerMeta(task.provider_id).label} isn't connected yet`,
            description: 'The admin hasn\'t added this network\'s account details yet. Check back soon.',
          });
          setBusy(null);
          return;
        }

        const result = await recordClick(task.provider_id, task.offer_id);
        if (!result.success) throw new Error(result.error || 'Could not start task');
        startedAt.current[task.id] = Date.now();
        setMyStatus((prev) => ({ ...prev, [task.id]: 'started' }));

        const adapter = getProviderAdapter(task.provider_id);
        const launchUrl = adapter.getLaunchUrl(
          {
            providerId: task.provider_id,
            displayName: providerMeta(task.provider_id).label,
            category: task.category,
            embedType: task.embedType,
            launchUrlTemplate: task.launchUrlTemplate,
            siteId: null,
          },
          { userId: user.id, clickId: result.clickId!, offerId: task.offer_id },
        );

        if (!launchUrl) {
          toast({ title: 'Could not build offer link', variant: 'destructive' });
          return;
        }

        if (task.embedType === 'link') {
          window.open(launchUrl, '_blank', 'noopener');
        } else {
          setActiveOfferwall({
            url: launchUrl,
            label: providerMeta(task.provider_id).label,
            isLocker: task.embedType === 'locker',
          });
        }

        toast({
          title: task.category === 'content' ? 'Locker opened 🔓' : 'Task started 🚀',
          description: 'Your reward lands automatically once the network confirms it.',
        });
      }
    } catch (e: any) {
      toast({ title: 'Could not start', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleClaim = async (task: LenoryTask) => {
    if (!user) return requireLogin();
    setBusy(task.id);
    try {
      const { data, error } = await supabase.rpc('claim_platform_task' as any, { p_task_id: task.id });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) {
        const msgs: Record<string, string> = {
          already_completed: 'You already claimed this one.',
          not_started: 'Tap Start Task first.',
          too_soon: 'Almost there — give the task a bit more time.',
        };
        toast({ title: 'Not yet', description: msgs[res?.error] || res?.error });
        return;
      }
      setMyStatus((prev) => ({ ...prev, [task.id]: 'completed' }));
      setStars((s) => s + (res.stars || 0));
      setTodayStars((s) => s + (res.stars || 0));
      toast({ title: `+${res.stars} Stars credited ⭐`, description: task.title });
    } catch (e: any) {
      toast({ title: 'Claim failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const ticker = liveFeed[tickIndex];

  const renderCard = (task: UnifiedTask, i: number) => {
    const status = myStatus[task.id];
    const isNetwork = task.source === 'network';
    const netTask = isNetwork ? (task as NetworkTask) : null;
    const lenoryTask = !isNetwork ? (task as LenoryTask) : null;
    const meta = netTask ? providerMeta(netTask.provider_id) : null;
    const Icon = netTask ? meta!.icon : ClipboardList;
    const isLocker = !!netTask && netTask.category === 'content';

    return (
      <motion.div
        key={task.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.04, 0.4) }}
        className="glass-card rounded-2xl p-4 border border-border/60 relative overflow-hidden"
      >
        {task.featured && (
          <span className="absolute top-0 right-0 text-[9px] font-bold px-2 py-1 rounded-bl-lg bg-gradient-to-r from-yellow-400 to-orange-500 text-black">
            HOT
          </span>
        )}
        <div className="flex gap-3">
          <span
            className={`w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br ${netTask ? meta!.tint : 'from-primary to-fuchsia-500'} flex items-center justify-center shadow-lg`}
          >
            <Icon className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight truncate">
              {netTask ? netTask.offer_name : lenoryTask!.title}
            </p>
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
              {netTask
                ? `Provider: ${meta!.label}${isLocker ? ' · Unlocks after completing an eligible offer' : ''}`
                : lenoryTask!.description || 'Complete this Lenory task to earn Stars'}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className="bg-yellow-400/15 text-yellow-400 border-yellow-400/30 text-[10px] gap-1">
                <Star className="w-3 h-3 fill-current" /> +{netTask ? netTask.user_reward_stars : lenoryTask!.payout_stars}
              </Badge>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Estimated completion: ~{task.est_minutes} min
              </span>
              {netTask && (
                <span className="text-[10px] text-muted-foreground">
                  Eligibility: {netTask.eligibility}
                </span>
              )}
              {status === 'pending' && (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                  ⏳ Pending
                </Badge>
              )}
              {netTask && !netTask.isConfigured && (
                <Badge className="bg-muted text-muted-foreground border-border text-[10px]">
                  Not connected yet
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          {status === 'completed' ? (
            <Button disabled size="sm" className="flex-1 gap-1.5" variant="secondary">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Completed
            </Button>
          ) : status === 'pending' ? (
            <Button disabled size="sm" className="flex-1 gap-1.5" variant="secondary">
              <Loader2 className="w-4 h-4 animate-spin" /> Pending approval
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                variant={netTask && !netTask.isConfigured ? 'secondary' : 'default'}
                disabled={busy === task.id || !eligibility.isReady}
                onClick={() => handleStart(task)}
              >
                {busy === task.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isLocker ? (
                  <Unlock className="w-4 h-4" />
                ) : (
                  <ArrowUpRight className="w-4 h-4" />
                )}
                {netTask && !netTask.isConfigured
                  ? 'Coming soon'
                  : status === 'started'
                  ? 'Open again'
                  : isLocker
                  ? 'Unlock'
                  : isNetwork
                  ? 'View Task'
                  : 'Start Task'}
              </Button>
              {!isNetwork && status === 'started' && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={busy === task.id}
                  onClick={() => handleClaim(task as LenoryTask)}
                >
                  <Sparkles className="w-4 h-4" /> Claim
                </Button>
              )}
            </>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      {/* Eligibility Gate - Centered Modal */}
      {!eligibility.isLoading && !eligibility.isReady && eligibility.errors.length > 0 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md p-6 rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-amber-600 text-lg mb-3">Complete Your Profile to Earn</p>
                <ul className="text-sm text-amber-600/90 space-y-2 mb-4">
                  {eligibility.errors.map((err, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                      {err}
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  className="w-full border-amber-500/50 hover:bg-amber-500/10 text-amber-600 font-semibold"
                  variant="outline"
                  onClick={() => navigate('/settings')}
                >
                  Complete Profile →
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden px-4 pt-6 pb-5">
        <div className="absolute -top-20 -left-10 w-56 h-56 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -top-10 right-0 w-48 h-48 rounded-full bg-yellow-400/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <motion.span
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 flex items-center justify-center shadow-lg shadow-primary/40"
            >
              <Gift className="w-5 h-5 text-primary-foreground" />
            </motion.span>
            <div>
              <h1 className="text-xl font-black leading-tight">Tasks Center</h1>
              <p className="text-[11px] text-muted-foreground">Complete eligible opportunities and earn Stars ⭐</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-border/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Available Stars</p>
                <p className="text-3xl font-black flex items-center gap-1.5">
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  {stars.toLocaleString()}
                </p>
                <p className="text-xs text-primary mt-0.5">
                  ≈ ₦{(stars * 300).toLocaleString()} in Star value
                </p>
              </div>
              <div className="text-right space-y-1">
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-[10px]">
                  +{todayStars} ⭐ today
                </Badge>
                <button
                  onClick={() => navigate('/wallet')}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Wallet className="w-3 h-3" /> ₦{wallet.toLocaleString()}
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Task Balance — deliberately separate from Star Balance.
                Pending here means a network hasn't confirmed the
                conversion yet; it only becomes Star Balance once
                approved. */}
            <button
              onClick={toggleHistory}
              className="w-full mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-left"
            >
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Task Balance</p>
                <p className="text-sm font-bold text-amber-500">
                  {pendingStars > 0 ? `${pendingStars.toLocaleString()} ⭐ pending` : 'Nothing pending'}
                </p>
              </div>
              <span className="text-[11px] text-primary flex items-center gap-1">
                {showHistory ? 'Hide history' : 'View history'}
                <ArrowUpRight className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-90' : ''}`} />
              </span>
            </button>
          </div>

          {/* Task Balance history — every ledger entry for this user:
              what a network paid, what it converted to in Stars, and
              its current status (spec #4/#17: full auditable history). */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card rounded-2xl mt-2 border border-border/60 overflow-hidden"
              >
                <div className="p-3 max-h-72 overflow-y-auto space-y-2">
                  {historyLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : historyRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No task activity yet.</p>
                  ) : (
                    historyRows.map((row) => {
                      const statusStyle: Record<string, string> = {
                        clicked: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                        pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                        approved: 'bg-green-500/15 text-green-400 border-green-500/30',
                        available: 'bg-green-500/15 text-green-400 border-green-500/30',
                        reversed: 'bg-red-500/15 text-red-400 border-red-500/30',
                        rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
                      };
                      return (
                        <div key={row.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{row.offer_name || providerMeta(row.provider_id).label}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(row.created_at).toLocaleDateString()} · ${Number(row.provider_payout_usd || 0).toFixed(2)} payout
                              {row.status === 'reversed' && row.reversal_reason ? ` · ${row.reversal_reason}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-yellow-400">+{row.user_reward_stars}⭐</p>
                            <Badge className={`text-[9px] ${statusStyle[row.status] || ''}`}>{row.status}</Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Live ticker */}
      <div className="px-4">
        <div className="glass-card rounded-xl px-3 py-2.5 border border-border/60 overflow-hidden">
          <AnimatePresence mode="wait">
            {ticker ? (
              <motion.div
                key={ticker.id}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-base">🎉</span>
                <p className="truncate">
                  <span className="font-bold text-primary">Someone</span>{' '}
                  earned <span className="font-bold text-yellow-400">+{ticker.user_reward_stars}⭐</span>{' '}
                  on {providerMeta(ticker.provider_id).label}
                </p>
              </motion.div>
            ) : (
              <p key="idle" className="text-xs text-muted-foreground text-center">
                🔄 Be the first to complete a task today
              </p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = selected === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all border ${
                active
                  ? 'bg-gradient-to-r from-primary to-fuchsia-500 text-white border-transparent shadow-lg'
                  : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tasks */}
      <div className="px-4 space-y-3">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted/40 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No tasks here yet — check back soon.</p>
          </div>
        ) : (
          <>
            {featuredList.length > 0 && (
              <>
                <p className="text-xs font-bold text-foreground/80 px-1 flex items-center gap-1.5">
                  🔥 Available for You
                </p>
                {featuredList.map((task, i) => renderCard(task, i))}
              </>
            )}
            {moreList.length > 0 && (
              <>
                <p className="text-xs font-bold text-foreground/80 px-1 pt-2 flex items-center gap-1.5">
                  More opportunities
                </p>
                {moreList.map((task, i) => renderCard(task, i))}
              </>
            )}
          </>
        )}
      </div>

      {/* Advertising strip — Monetag etc. Separate from the earn tabs on
          purpose (spec #23): it funds the platform but never converts
          to Stars, so it's never mixed in with Offers/Surveys/Content. */}
      {adNetworks.length > 0 && (
        <div className="px-4 pt-5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Advertising
          </p>
          {adNetworks.map((p) => {
            const meta = providerMeta(p.provider_id);
            const Icon = meta.icon;
            return (
              <div
                key={p.provider_id}
                className="glass-card rounded-xl p-3 border border-border/60 flex items-center gap-3 mb-2 opacity-80"
              >
                <span className={`w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br ${meta.tint} flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{p.display_name}</p>
                  <p className="text-[11px] text-muted-foreground">Supports Lenory through ads — doesn't earn Stars</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center px-8 mt-6">
        Network offers credit automatically once the partner confirms your completion (usually
        within a few minutes). Lenory tasks are claimed here.
      </p>

      {activeOfferwall && (
        <OfferwallModal
          url={activeOfferwall.url}
          providerLabel={activeOfferwall.label}
          isLocker={activeOfferwall.isLocker}
          onClose={() => {
            setActiveOfferwall(null);
            // Re-check status in case the user finished and the
            // network already fired its postback while the modal was open.
            loadMyStatus();
          }}
        />
      )}
    </div>
  );
};

export default Offers;

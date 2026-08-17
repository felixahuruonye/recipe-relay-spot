import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Sparkles, Star, Clock, ArrowUpRight, Zap, Flame, Smartphone,
  Target, Globe, Lock, ClipboardList, CheckCircle2, Loader2, Wallet,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface OfferTask {
  id: string;
  provider: string;
  title: string;
  description: string | null;
  instructions: string | null;
  payout_stars: number;
  payout_naira: number;
  est_minutes: number;
  url: string | null;
  image_url: string | null;
  category: string;
  featured: boolean;
}

interface Completion {
  id: string;
  username: string | null;
  provider: string;
  task_title: string | null;
  stars_credited: number;
  created_at: string;
}

const PROVIDERS = [
  { id: 'ALL', label: 'All Tasks', icon: Zap, tint: 'from-cyan-400 to-blue-500' },
  { id: 'CUSTOM', label: 'Lenory Tasks', icon: ClipboardList, tint: 'from-primary to-fuchsia-500' },
  { id: 'MONLIX', label: 'Monlix', icon: Flame, tint: 'from-orange-400 to-red-500' },
  { id: 'OGADS', label: 'OGAds', icon: Smartphone, tint: 'from-emerald-400 to-teal-500' },
  { id: 'MYLEAD', label: 'MyLead', icon: Target, tint: 'from-yellow-400 to-amber-500' },
  { id: 'MONETAG', label: 'Monetag', icon: Globe, tint: 'from-sky-400 to-indigo-500' },
  { id: 'CPAGRIP', label: 'CPAGrip', icon: Lock, tint: 'from-pink-400 to-rose-500' },
];

const providerMeta = (id: string) =>
  PROVIDERS.find((p) => p.id === id.toUpperCase()) || PROVIDERS[0];

const Offers: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<OfferTask[]>([]);
  const [selected, setSelected] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [wallet, setWallet] = useState(0);
  const [todayStars, setTodayStars] = useState(0);
  const [liveFeed, setLiveFeed] = useState<Completion[]>([]);
  const [tickIndex, setTickIndex] = useState(0);
  const [myStatus, setMyStatus] = useState<Record<string, 'started' | 'completed'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const startedAt = useRef<Record<string, number>>({});

  useEffect(() => {
    loadTasks();
    loadLiveFeed();
    const channel = supabase
      .channel('offer-live-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'offer_task_completions' },
        (payload: any) => {
          if (payload.new?.status === 'completed') {
            setLiveFeed((prev) => [payload.new as Completion, ...prev].slice(0, 20));
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
    const { data } = await supabase
      .from('offer_tasks' as any)
      .select('*')
      .eq('active', true)
      .order('featured', { ascending: false })
      .order('payout_stars', { ascending: false });
    setTasks(((data as any[]) || []) as OfferTask[]);
    setLoading(false);
  };

  const loadLiveFeed = async () => {
    const { data } = await supabase
      .from('offer_task_completions' as any)
      .select('id, username, provider, task_title, stars_credited, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20);
    setLiveFeed(((data as any[]) || []) as Completion[]);
  };

  const loadBalance = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('star_balance, wallet_balance')
      .eq('id', user.id)
      .maybeSingle();
    setStars(data?.star_balance ?? 0);
    setWallet(Number(data?.wallet_balance ?? 0));
  };

  const loadMyStatus = async () => {
    if (!user) return;
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const { data } = await supabase
      .from('offer_task_completions' as any)
      .select('task_id, status, stars_credited, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    const map: Record<string, 'started' | 'completed'> = {};
    let today = 0;
    ((data as any[]) || []).forEach((row) => {
      if (row.task_id && !map[row.task_id]) map[row.task_id] = row.status;
      if (row.status === 'completed' && row.created_at >= since) today += row.stars_credited || 0;
      if (row.status === 'started' && row.task_id && !startedAt.current[row.task_id]) {
        startedAt.current[row.task_id] = new Date(row.created_at).getTime();
      }
    });
    setMyStatus(map);
    setTodayStars(today);
  };

  const filtered = useMemo(
    () => (selected === 'ALL' ? tasks : tasks.filter((t) => t.provider === selected)),
    [tasks, selected],
  );

  const requireLogin = () => {
    toast({ title: 'Login required', description: 'Sign in to start earning from tasks.' });
    navigate('/auth');
  };

  const handleStart = async (task: OfferTask) => {
    if (!user) return requireLogin();
    setBusy(task.id);
    try {
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
      toast({
        title: 'Task started 🚀',
        description:
          task.provider === 'CUSTOM'
            ? 'Finish it, then come back and tap Claim.'
            : 'Your reward lands automatically once the network confirms it.',
      });
    } catch (e: any) {
      toast({ title: 'Could not start', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleClaim = async (task: OfferTask) => {
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

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
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
              <h1 className="text-xl font-black leading-tight">Earn Center</h1>
              <p className="text-[11px] text-muted-foreground">Complete tasks, stack Stars, cash out</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-border/60">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Live balance</p>
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
          </div>
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
                  <span className="font-bold text-primary">@{ticker.username || 'someone'}</span>{' '}
                  earned <span className="font-bold text-yellow-400">+{ticker.stars_credited}⭐</span>{' '}
                  on {providerMeta(ticker.provider).label}
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

      {/* Provider tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-4">
        {PROVIDERS.map((p) => {
          const Icon = p.icon;
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all border ${
                active
                  ? `bg-gradient-to-r ${p.tint} text-white border-transparent shadow-lg`
                  : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {p.label}
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
          filtered.map((task, i) => {
            const meta = providerMeta(task.provider);
            const Icon = meta.icon;
            const status = myStatus[task.id];
            const isCustom = task.provider === 'CUSTOM';
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
                    className={`w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br ${meta.tint} flex items-center justify-center shadow-lg`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{task.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                      {task.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge className="bg-yellow-400/15 text-yellow-400 border-yellow-400/30 text-[10px] gap-1">
                        <Star className="w-3 h-3 fill-current" /> +{task.payout_stars}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> ~{task.est_minutes} min
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  {status === 'completed' ? (
                    <Button disabled size="sm" className="flex-1 gap-1.5" variant="secondary">
                      <CheckCircle2 className="w-4 h-4 text-green-500" /> Completed
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        disabled={busy === task.id}
                        onClick={() => handleStart(task)}
                      >
                        {busy === task.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                        {status === 'started' ? 'Open again' : 'Start Task'}
                      </Button>
                      {isCustom && status === 'started' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="gap-1.5"
                          disabled={busy === task.id}
                          onClick={() => handleClaim(task)}
                        >
                          <Sparkles className="w-4 h-4" /> Claim
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center px-8 mt-6">
        Network offers credit automatically once the partner confirms your completion (usually
        within a few minutes). Lenory tasks are claimed here.
      </p>
    </div>
  );
};

export default Offers;

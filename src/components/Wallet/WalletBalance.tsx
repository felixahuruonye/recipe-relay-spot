import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Star, TrendingUp, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export const WalletBalance = () => {
  const { user } = useAuth();
  const [walletBalance, setWalletBalance] = useState(0);
  const [starBalance, setStarBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [pendingTipEarnings, setPendingTipEarnings] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('wallet_balance, star_balance, total_earned, pending_tip_earnings')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      if (data) {
        setWalletBalance(Number((data as any).wallet_balance || 0));
        setStarBalance(Number((data as any).star_balance || 0));
        setTotalEarned(Number((data as any).total_earned || 0));
        setPendingTipEarnings(Number((data as any).pending_tip_earnings || 0));
      }
    } catch (e: any) {
      console.error('Error fetching balances:', e);
      setLoadError(e?.message || 'Failed to load balances');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    try {
      const rows: any[] = [];
      const seen = new Set<string>();
      const push = (row: any) => {
        if (!row?.id || seen.has(row.id)) return;
        seen.add(row.id);
        rows.push(row);
      };

      // 1) wallet_history (own rows)
      const histRes = await supabase
        .from('wallet_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (histRes.error) {
        console.warn('wallet_history', histRes.error.message);
      } else {
        (histRes.data || []).forEach((t: any) => {
          push({
            id: `wh-${t.id}`,
            type: t.type || t.transaction_type || 'wallet',
            amount: Number(t.amount || 0),
            created_at: t.created_at,
            source: 'wallet_history',
            detail: t.meta?.label || t.description || undefined,
            unit: 'ngn',
          });
        });
      }

      // 2) Tips via SECURITY DEFINER RPC (bypasses RLS so creators see tips received)
      let tipRows: any[] = [];
      const rpcTips = await (supabase as any).rpc('get_my_tips');
      if (!rpcTips.error && Array.isArray(rpcTips.data)) {
        tipRows = rpcTips.data;
        setLoadError(null);
      } else {
        if (rpcTips.error) console.warn('get_my_tips', rpcTips.error.message);
        // Fallback direct queries
        const tipsRes = await (supabase as any)
          .from('tip_ledger')
          .select('id, stars, viewer_ngn, creator_ngn, platform_ngn, source, status, created_at, from_user_id, to_user_id')
          .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(100);
        if (tipsRes.error) {
          const [outFb, inFb] = await Promise.all([
            (supabase as any).from('tip_ledger').select('*').eq('from_user_id', user.id).limit(100),
            (supabase as any).from('tip_ledger').select('*').eq('to_user_id', user.id).limit(100),
          ]);
          tipRows = [...(outFb.data || []), ...(inFb.data || [])];
          if (outFb.error || inFb.error) {
            setLoadError((prev) => prev || `Tip history blocked — run get_my_tips SQL`);
          }
        } else {
          tipRows = tipsRes.data || [];
        }
      }

      tipRows.forEach((t: any) => {
        const isViewer = t.from_user_id === user.id;
        const isCreator = t.to_user_id === user.id;
        if (isViewer) {
          const spent = Number(t.stars || 0);
          const cash = Number(t.viewer_ngn || 0);
          if (spent > 0) {
            push({
              id: `tip-spend-${t.id}`,
              type: 'star_spend',
              amount: spent,
              created_at: t.created_at,
              source: t.source || 'tip',
              detail: `⭐${spent} tipped (${t.source || 'tip'})`,
              unit: 'stars',
            });
          }
          if (cash > 0) {
            push({
              id: `tip-cash-${t.id}`,
              type: 'tip_cashback',
              amount: cash,
              created_at: t.created_at,
              source: t.source || 'tip',
              detail: `Cashback pending · ⭐${spent}`,
              unit: 'ngn',
            });
          }
        }
        if (isCreator) {
          const amt = Number(t.creator_ngn || 0);
          if (amt > 0) {
            push({
              id: `tip-in-${t.id}`,
              type: 'tip_pending',
              amount: amt,
              created_at: t.created_at,
              source: t.source || 'tip',
              detail: `Tip received · ⭐${t.stars || 0} · ${t.status || 'pending'}`,
              unit: 'ngn',
            });
          }
        }
      });

      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransactions(rows.slice(0, 120));
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      setLoadError(error?.message || 'Failed to load history');
    }
  }, [user]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    await Promise.all([fetchBalances(), fetchTransactions()]);
    setRefreshing(false);
  }, [fetchBalances, fetchTransactions]);

  useEffect(() => {
    if (!user) return;
    fetchBalances();
    fetchTransactions();

    const ch = supabase
      .channel(`wallet-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_history', filter: `user_id=eq.${user.id}` }, () => {
        fetchTransactions();
        fetchBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_ledger' }, () => {
        fetchTransactions();
        fetchBalances();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `id=eq.${user.id}` }, () => {
        fetchBalances();
      })
      .subscribe();

    const poll = setInterval(() => {
      fetchTransactions();
      fetchBalances();
    }, 4000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [user, fetchBalances, fetchTransactions]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);

  const formatAmount = (tx: any) => {
    if (tx.unit === 'stars' || String(tx.type).includes('star_spend')) {
      return `${tx.amount >= 0 ? '' : '-'}⭐${Math.abs(Number(tx.amount || 0))}`;
    }
    const n = Number(tx.amount || 0);
    return `${n >= 0 ? '+' : '-'}${formatCurrency(Math.abs(n))}`;
  };

  const getTransactionIcon = (type: string) => {
    const t = String(type || '').toLowerCase();
    if (t.includes('pending') || t.includes('earn') || t.includes('credit') || t.includes('cashback')) {
      return <ArrowUpRight className="w-4 h-4 text-green-500" />;
    }
    if (t.includes('spend') || t.includes('debit') || t.includes('withdraw')) {
      return <ArrowDownRight className="w-4 h-4 text-red-500" />;
    }
    return <Wallet className="w-4 h-4 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(walletBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">Available to withdraw</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              Star Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold flex items-center gap-1">
              <span className="text-yellow-500">⭐</span> {starBalance}
            </p>
            <p className="text-xs text-muted-foreground mt-1">For tips & auto-spend</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              Pending Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-500">{formatCurrency(pendingTipEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">Cashbacks + tips locked until verification unlock</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Available / Lifetime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{formatCurrency(totalEarned)}</p>
            <p className="text-xs text-muted-foreground mt-1">Released for withdrawal</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span>Transaction History</span>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={() => refreshAll()} disabled={refreshing}>
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" size="sm" variant="outline">View all</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>All transactions</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                        <div className="flex items-center gap-3">
                          {getTransactionIcon(tx.type)}
                          <div>
                            <p className="font-medium text-sm">{String(tx.type).replace(/_/g, ' ').toUpperCase()}</p>
                            {tx.detail && <p className="text-xs text-muted-foreground">{tx.detail}</p>}
                            <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <p className={`font-bold ${Number(tx.amount) >= 0 && tx.unit !== 'stars' ? 'text-green-500' : tx.unit === 'stars' ? 'text-red-500' : Number(tx.amount) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {formatAmount(tx)}
                        </p>
                      </div>
                    ))}
                    {transactions.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">No transactions yet</p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadError && (
            <p className="text-xs text-amber-600 bg-amber-500/10 rounded-md p-2">{loadError}</p>
          )}
          {transactions.slice(0, 12).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
              <div className="flex items-center gap-3">
                {getTransactionIcon(tx.type)}
                <div>
                  <p className="font-medium text-sm">{String(tx.type).replace(/_/g, ' ').toUpperCase()}</p>
                  {tx.detail && <p className="text-xs text-muted-foreground">{tx.detail}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
              </div>
              <p className={`font-bold ${tx.unit === 'stars' ? 'text-red-500' : Number(tx.amount) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatAmount(tx)}
              </p>
            </div>
          ))}
          {transactions.length === 0 && !loadError && (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletBalance;

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Star, TrendingUp, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const WalletBalance = () => {
  const { user } = useAuth();
  const [walletBalance, setWalletBalance] = useState(0);
  const [starBalance, setStarBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBalances = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('wallet_balance, star_balance, total_earned')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      if (data) {
        setWalletBalance(Number((data as any).wallet_balance || 0));
        setStarBalance(Number((data as any).star_balance || 0));
        setTotalEarned(Number((data as any).total_earned || 0));
      }
    } catch (e) {
      console.error('Error fetching balances:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      const [{ data: hist }, { data: tipsAsViewer }, { data: tipsAsCreator }] = await Promise.all([
        supabase.from('wallet_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
        (supabase as any).from('tip_ledger').select('*').eq('from_user_id', user.id).order('created_at', { ascending: false }).limit(50),
        (supabase as any).from('tip_ledger').select('*').eq('to_user_id', user.id).order('created_at', { ascending: false }).limit(50),
      ]);

      const fromHist = (hist || []).map((t: any) => ({
        id: t.id,
        type: t.type || t.transaction_type || 'wallet',
        amount: Number(t.amount || 0),
        created_at: t.created_at,
      }));

      const fromTipsOut = (tipsAsViewer || []).map((t: any) => ({
        id: `tip-out-${t.id}`,
        type: 'tip_cashback',
        amount: Number(t.viewer_ngn || 0),
        created_at: t.created_at,
      }));

      const fromTipsIn = (tipsAsCreator || []).map((t: any) => ({
        id: `tip-in-${t.id}`,
        type: 'tip_earn',
        amount: Number(t.creator_ngn || 0),
        created_at: t.created_at,
      }));

      const merged = [...fromHist, ...fromTipsOut, ...fromTipsIn]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
      setTransactions(merged);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchBalances();
    fetchTransactions();

    const channel = supabase
      .channel('wallet-changes-' + user.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_profiles',
        filter: `id=eq.${user.id}`,
      }, () => { fetchBalances(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wallet_history',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchTransactions(); fetchBalances(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'withdrawal_history',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchTransactions(); fetchBalances(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'view_transactions',
        filter: `uploader_id=eq.${user.id}`,
      }, () => { fetchTransactions(); fetchBalances(); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tip_ledger',
      }, () => { fetchTransactions(); fetchBalances(); })
      .subscribe();

    const poll = setInterval(() => {
      fetchBalances();
      fetchTransactions();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [user]);

  const formatCurrency = (amount: number) =>
    `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getTransactionIcon = (type: string) =>
    type.includes('earn') || type.includes('credit') || type.includes('cashback') ? (
      <ArrowDownRight className="w-4 h-4 text-green-500" />
    ) : (
      <ArrowUpRight className="w-4 h-4 text-red-500" />
    );

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/2" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Wallet Balance
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
              <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              {starBalance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">For tips & auto-spend</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Total Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{formatCurrency(totalEarned)}</p>
            <p className="text-xs text-muted-foreground mt-1">Lifetime earnings</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Transaction History</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => { fetchBalances(); fetchTransactions(); }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8">
                    View all
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>All transactions</DialogTitle>
                  </DialogHeader>
                  <Tabs defaultValue="all">
                    <TabsList className="grid grid-cols-3 w-full">
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="earning">Earning</TabsTrigger>
                      <TabsTrigger value="spending">Spending</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all" className="space-y-2 mt-4">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                          <div className="flex items-center gap-3">
                            {getTransactionIcon(tx.type)}
                            <div>
                              <p className="font-medium text-sm">{String(tx.type).replace(/_/g, ' ').toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                          <p className={`font-bold ${tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {tx.amount >= 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                          </p>
                        </div>
                      ))}
                    </TabsContent>
                    <TabsContent value="earning" className="space-y-2 mt-4">
                      {transactions.filter(tx => String(tx.type).includes('earn') || String(tx.type).includes('credit') || String(tx.type).includes('cashback')).map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                          <div className="flex items-center gap-3">
                            <ArrowDownRight className="w-4 h-4 text-green-500" />
                            <div>
                              <p className="font-medium text-sm">{String(tx.type).replace(/_/g, ' ').toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                          <p className="font-bold text-green-500">+{formatCurrency(Math.abs(tx.amount))}</p>
                        </div>
                      ))}
                    </TabsContent>
                    <TabsContent value="spending" className="space-y-2 mt-4">
                      {transactions.filter(tx => !String(tx.type).includes('earn') && !String(tx.type).includes('credit') && !String(tx.type).includes('cashback')).map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                          <div className="flex items-center gap-3">
                            <ArrowUpRight className="w-4 h-4 text-red-500" />
                            <div>
                              <p className="font-medium text-sm">{String(tx.type).replace(/_/g, ' ').toUpperCase()}</p>
                              <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                          <p className="font-bold text-red-500">-{formatCurrency(Math.abs(tx.amount))}</p>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.slice(0, 5).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
              <div className="flex items-center gap-3">
                {getTransactionIcon(tx.type)}
                <div>
                  <p className="font-medium text-sm">{String(tx.type).replace(/_/g, ' ').toUpperCase()}</p>
                  <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
              </div>
              <p className={`font-bold ${tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {tx.amount >= 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
              </p>
            </div>
          ))}
          {transactions.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

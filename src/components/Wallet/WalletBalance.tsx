import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Star, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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

  useEffect(() => {
    if (user) {
      fetchBalances();
      fetchTransactions();
      
      // Subscribe to real-time updates
      const channel = supabase
        .channel('wallet-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`
        }, () => {
          fetchBalances();
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'wallet_history',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchTransactions();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchBalances = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('wallet_balance, star_balance, total_earned')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      setWalletBalance(data?.wallet_balance || 0);
      setStarBalance(data?.star_balance || 0);
      setTotalEarned(data?.total_earned || 0);
    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('wallet_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTransactionIcon = (type: string) => {
    return type.includes('earn') || type.includes('credit') ? (
      <ArrowDownRight className="w-4 h-4 text-green-500" />
    ) : (
      <ArrowUpRight className="w-4 h-4 text-red-500" />
    );
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/2"></div>
            <div className="h-12 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Wallet Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold gradient-text">{formatCurrency(walletBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">Available to withdraw</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="w-4 h-4 fill-current" />
              Star Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{starBalance}⭐</p>
            <p className="text-xs text-muted-foreground mt-1">Use to unlock content</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Total Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{formatCurrency(totalEarned)}</p>
            <p className="text-xs text-muted-foreground mt-1">Lifetime earnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Transactions</span>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">View All</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Transaction History</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="all">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="earnings">Earnings</TabsTrigger>
                    <TabsTrigger value="spending">Spending</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="all" className="space-y-2 mt-4">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                        <div className="flex items-center gap-3">
                          {getTransactionIcon(tx.type)}
                          <div>
                            <p className="font-medium text-sm">{tx.type.replace(/_/g, ' ').toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className={`font-bold ${tx.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {tx.amount >= 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                        </p>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="earnings" className="space-y-2 mt-4">
                    {transactions.filter(tx => tx.type.includes('earn') || tx.type.includes('credit')).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                        <div className="flex items-center gap-3">
                          <ArrowDownRight className="w-4 h-4 text-green-500" />
                          <div>
                            <p className="font-medium text-sm">{tx.type.replace(/_/g, ' ').toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-green-500">+{formatCurrency(Math.abs(tx.amount))}</p>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="spending" className="space-y-2 mt-4">
                    {transactions.filter(tx => !tx.type.includes('earn') && !tx.type.includes('credit')).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
                        <div className="flex items-center gap-3">
                          <ArrowUpRight className="w-4 h-4 text-red-500" />
                          <div>
                            <p className="font-medium text-sm">{tx.type.replace(/_/g, ' ').toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-red-500">-{formatCurrency(Math.abs(tx.amount))}</p>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {transactions.slice(0, 5).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-3 glass-card rounded-lg">
              <div className="flex items-center gap-3">
                {getTransactionIcon(tx.type)}
                <div>
                  <p className="font-medium text-sm">{tx.type.replace(/_/g, ' ').toUpperCase()}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString()}
                  </p>
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

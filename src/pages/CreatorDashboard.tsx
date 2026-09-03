import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, Users, DollarSign, Crown, Star } from 'lucide-react';
import { CreatorMonetizationCard } from '@/components/Profile/CreatorMonetizationCard';
import { WithdrawalForm } from '@/components/Profile/WithdrawalForm';
import { useToast } from '@/hooks/use-toast';

interface CreatorStats {
  totalViews: number;
  totalEarnings: number;
  followerCount: number;
  postCount: number;
  totalReactions: number;
}

const CreatorDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<CreatorStats>({
    totalViews: 0,
    totalEarnings: 0,
    followerCount: 0,
    postCount: 0,
    totalReactions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showWithdrawal, setShowWithdrawal] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchCreatorStats();
    }
  }, [user?.id]);

  const fetchCreatorStats = async () => {
    if (!user?.id) return;
    try {
      // Fetch user profile
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('follower_count, post_count, wallet_balance')
        .eq('id', user.id)
        .single();

      // Fetch total views from all posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('view_count')
        .eq('user_id', user.id);

      // Fetch total reactions
      const { count: reactionsCount } = await (supabase as any)
        .from('post_likes')
        .select('*', { count: 'exact', head: true })
        .in('post_id', (postsData || []).map((p: any) => p.id));

      const totalViews = (postsData || []).reduce((sum: number, p: any) => sum + (p.view_count || 0), 0);
      const totalEarnings = profileData?.wallet_balance || 0;

      setStats({
        totalViews,
        totalEarnings,
        followerCount: profileData?.follower_count || 0,
        postCount: profileData?.post_count || 0,
        totalReactions: reactionsCount || 0,
      });
    } catch (error) {
      console.error('Error fetching creator stats:', error);
      toast({ title: 'Error', description: 'Failed to load creator stats', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, label, value, trend }: any) => (
    <Card className="glass-card">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {trend && <p className="text-xs text-green-500 mt-1">+{trend}% this month</p>}
          </div>
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold gradient-text">Creator Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage your creator profile and earnings</p>
        </div>
      </div>

      {/* Stats Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp} label="Total Views" value={stats.totalViews} />
          <StatCard icon={DollarSign} label="Total Earnings" value={`₦${stats.totalEarnings.toLocaleString()}`} />
          <StatCard icon={Users} label="Followers" value={stats.followerCount} />
          <StatCard icon={Star} label="Total Reactions" value={stats.totalReactions} />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="monetization" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monetization">
            <Crown className="w-4 h-4 mr-2" />
            Monetization
          </TabsTrigger>
          <TabsTrigger value="earnings">
            <DollarSign className="w-4 h-4 mr-2" />
            Earnings
          </TabsTrigger>
          <TabsTrigger value="withdrawal">
            <TrendingUp className="w-4 h-4 mr-2" />
            Withdrawal
          </TabsTrigger>
        </TabsList>

        {/* Monetization Tab */}
        <TabsContent value="monetization" className="space-y-4">
          {user?.id && <CreatorMonetizationCard userId={user.id} />}
        </TabsContent>

        {/* Earnings Tab */}
        <TabsContent value="earnings">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Earnings Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
                  <p className="text-2xl font-bold">₦{stats.totalEarnings.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <p className="text-sm text-muted-foreground mb-1">Pending Withdrawal</p>
                  <p className="text-2xl font-bold">₦0</p>
                  <p className="text-xs text-muted-foreground mt-1">None yet</p>
                </div>
              </div>

              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base">How You Earn</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">Views</p>
                      <p className="text-xs text-muted-foreground">Earn stars when users watch your posts</p>
                    </div>
                    <Badge>40%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">Likes & Comments</p>
                      <p className="text-xs text-muted-foreground">Bonus earnings from engagement</p>
                    </div>
                    <Badge>Bonus</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">Follower Tips</p>
                      <p className="text-xs text-muted-foreground">Direct support from followers</p>
                    </div>
                    <Badge variant="outline">Optional</Badge>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdrawal Tab */}
        <TabsContent value="withdrawal">
          {user?.id && <WithdrawalForm userId={user.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CreatorDashboard;

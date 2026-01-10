import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Lock, ShieldAlert } from 'lucide-react';
import { ReportsTab } from '@/components/Admin/ReportsTab';
import { VIPManager } from '@/components/Admin/VIPManager';
import { AdminChat } from '@/components/Admin/AdminChat';
import { UserBalancesTab } from '@/components/Admin/UserBalancesTab';
import { WithdrawalsTab } from '@/components/Admin/WithdrawalsTab';
import { BroadcastTab } from '@/components/Admin/BroadcastTab';
import { StarPackagesTab } from '@/components/Admin/StarPackagesTab';
import { PostsTab } from '@/components/Admin/PostsTab';
import { StoriesTab } from '@/components/Admin/StoriesTab';
import { MarketplaceTab } from '@/components/Admin/MarketplaceTab';
import { UserMessagesTab } from '@/components/Admin/UserMessagesTab';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setIsCheckingAuth(false);
        return;
      }
      try {
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin'
        });
        if (error) {
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(data === true);
        }
      } catch (error) {
        setIsAuthenticated(false);
      }
      setIsCheckingAuth(false);
    };
    checkAdminRole();
  }, [user]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">You must be logged in to access the admin panel.</p>
            <Button onClick={() => navigate('/auth')} className="w-full">Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">You do not have admin privileges.</p>
            <Button onClick={() => navigate('/')} variant="outline" className="w-full">Return to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <Badge variant="outline" className="text-green-500 border-green-500">Admin Verified</Badge>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-max gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="balances">Balances</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
              <TabsTrigger value="messages">Admin Chat</TabsTrigger>
              <TabsTrigger value="user-messages">User Messages</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="stories">Stories</TabsTrigger>
              <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="vip">VIP</TabsTrigger>
              <TabsTrigger value="stars">Stars</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Quick Stats</CardTitle></CardHeader>
              <CardContent className="text-muted-foreground">
                <p>Use the tabs above to manage your app.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="balances"><UserBalancesTab /></TabsContent>
          <TabsContent value="withdrawals"><WithdrawalsTab /></TabsContent>
          <TabsContent value="broadcast"><BroadcastTab /></TabsContent>
          <TabsContent value="messages"><Card><CardContent className="pt-6"><AdminChat /></CardContent></Card></TabsContent>
          <TabsContent value="user-messages"><UserMessagesTab /></TabsContent>
          <TabsContent value="posts"><PostsTab /></TabsContent>
          <TabsContent value="stories"><StoriesTab /></TabsContent>
          <TabsContent value="marketplace"><MarketplaceTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
          <TabsContent value="vip"><VIPManager /></TabsContent>
          <TabsContent value="stars"><StarPackagesTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;

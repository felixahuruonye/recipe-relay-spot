import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Crown, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  vip: boolean;
  vip_expires_at: string | null;
  star_balance: number;
}

export const VIPManager: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadUsers();
    const channel = setupRealtimeSubscription();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('vip-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles'
        },
        () => {
          loadUsers();
        }
      )
      .subscribe();

    return channel;
  };

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, vip, vip_expires_at, star_balance')
      .order('vip', { ascending: false });

    if (error) {
      console.error('Error loading users:', error);
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  const updateVIP = async (userId: string, isVip: boolean, days: number = 30) => {
    const expiresAt = isVip
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from('user_profiles')
      .update({
        vip: isVip,
        vip_started_at: isVip ? new Date().toISOString() : null,
        vip_expires_at: expiresAt
      })
      .eq('id', userId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update VIP status',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'VIP Updated',
        description: `VIP status ${isVip ? 'granted' : 'removed'} successfully`
      });
      
      // Send notification to user
      if (isVip) {
        await supabase.from('user_notifications').insert({
          user_id: userId,
          title: '🌟 VIP Status Activated!',
          message: `Your VIP membership is now active for ${days} days. Enjoy exclusive features!`,
          type: 'success',
          notification_category: 'admin'
        });
      }
    }
  };

  const updateStarBalance = async (userId: string, newBalance: number) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ star_balance: newBalance })
      .eq('id', userId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update star balance',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Stars Updated',
        description: 'Star balance updated successfully'
      });
    }
  };

  const filteredUsers = users.filter(user =>
    user.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDaysRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return 0;
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center">
          <Crown className="w-5 h-5 mr-2 text-yellow-500" />
          VIP & Star Management
        </h2>
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredUsers.map((user) => (
          <Card key={user.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback>{user.username?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center">
                    {user.username}
                    {user.vip && <Crown className="w-4 h-4 ml-2 text-yellow-500" />}
                  </CardTitle>
                  {user.vip && user.vip_expires_at && (
                    <p className="text-xs text-muted-foreground">
                      {getDaysRemaining(user.vip_expires_at)} days remaining
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-medium">{user.star_balance || 0}</span>
                </div>
                <Input
                  type="number"
                  className="w-24 h-8"
                  defaultValue={user.star_balance || 0}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value !== user.star_balance) {
                      updateStarBalance(user.id, value);
                    }
                  }}
                />
              </div>

              <div className="flex items-center space-x-2">
                {user.vip ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => updateVIP(user.id, false)}
                  >
                    Remove VIP
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => updateVIP(user.id, true, 30)}
                    >
                      30 Days
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => updateVIP(user.id, true, 90)}
                    >
                      90 Days
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

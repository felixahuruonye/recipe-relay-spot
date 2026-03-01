import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, Heart, MessageCircle, AlertCircle, Settings, Trash2, X, UserPlus, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  related_id: string | null;
  notification_category: string;
  is_read: boolean;
  created_at: string;
  action_data?: any;
}

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);

  useEffect(() => {
    if (user) {
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [user]);

  const loadNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading notifications:', error);
    } else {
      const mappedData = (data || []).map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type || 'general',
        related_id: n.related_id,
        notification_category: n.notification_category || 'general',
        is_read: n.is_read_receipt || false,
        created_at: n.created_at,
        action_data: n.action_data
      }));
      setNotifications(mappedData);
    }
    setLoading(false);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user?.id}` }, (payload) => {
        const newNotification = {
          id: payload.new.id,
          title: payload.new.title,
          message: payload.new.message,
          type: payload.new.type || 'general',
          related_id: payload.new.related_id,
          notification_category: payload.new.notification_category || 'general',
          is_read: payload.new.is_read_receipt || false,
          created_at: payload.new.created_at,
          action_data: payload.new.action_data
        };
        setNotifications((prev) => [newNotification, ...prev]);
        toast({ title: newNotification.title, description: newNotification.message });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const markAsRead = async (notificationId: string) => {
    await supabase.from('user_notifications').update({ is_read_receipt: true }).eq('id', notificationId);
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)));
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (manageMode) return;
    await markAsRead(notification.id);

    const data = notification.action_data as any;

    // Follow notification - navigate to user profile
    if (notification.notification_category === 'follow' && data?.follower_id) {
      navigate(`/profile/${data.follower_id}`);
      return;
    }

    // Comment/reply notification - navigate to post
    if ((notification.notification_category === 'comment' || notification.notification_category === 'reply' || notification.notification_category === 'reaction') && notification.related_id) {
      navigate(`/?post=${notification.related_id}`);
      return;
    }

    if (notification.notification_category === 'admin' && data) {
      if (data.type === 'vip') navigate('/profile');
      return;
    }

    // Delivery/marketplace notifications
    if (notification.notification_category === 'delivery' || notification.notification_category === 'marketplace') {
      navigate('/marketplace');
      return;
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === notifications.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(notifications.map(n => n.id)));
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const { error } = await supabase.from('user_notifications').delete().in('id', Array.from(selectedIds));
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete notifications', variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: `${selectedIds.size} notification(s) removed` });
      setNotifications(prev => prev.filter(n => !selectedIds.has(n.id)));
      setSelectedIds(new Set());
      setManageMode(false);
    }
  };

  const handleFollowBack = async (followerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await supabase.from('followers').insert({ follower_id: user.id, following_id: followerId });
      toast({ title: 'Followed!', description: 'You are now following this user.' });
    } catch (err) {
      console.error(err);
    }
  };

  const renderNotificationContent = (notification: Notification) => {
    const data = notification.action_data as any;

    // Follow notification with avatar, username, and follow back button
    if (notification.notification_category === 'follow' && data?.avatar_url) {
      return (
        <div className="flex items-center gap-3 w-full">
          <Avatar className="w-10 h-10 shrink-0 cursor-pointer" onClick={() => navigate(`/profile/${data.follower_id}`)}>
            <AvatarImage src={data.avatar_url} />
            <AvatarFallback>{data.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{data.username || notification.title}</p>
            <p className="text-sm text-muted-foreground">{notification.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={(e) => handleFollowBack(data.follower_id, e)} className="shrink-0">
            <UserPlus className="w-3 h-3 mr-1" /> Follow
          </Button>
        </div>
      );
    }

    // Comment/reply notification with avatar and view button
    if ((notification.notification_category === 'comment' || notification.notification_category === 'reply') && data?.avatar_url) {
      return (
        <div className="flex items-center gap-3 w-full">
          <Avatar className="w-10 h-10 shrink-0 cursor-pointer" onClick={() => data?.commenter_id && navigate(`/profile/${data.commenter_id}`)}>
            <AvatarImage src={data.avatar_url} />
            <AvatarFallback>{data.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{data.username || notification.title}</p>
            <p className="text-sm text-muted-foreground truncate">{notification.message}</p>
          </div>
          {notification.related_id && (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/?post=${notification.related_id}`); }} className="shrink-0">
              <Eye className="w-3 h-3 mr-1" /> View
            </Button>
          )}
        </div>
      );
    }

    // Default notification
    return (
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-1">
          {renderNotificationIcon(notification)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-sm">{notification.title}</p>
            <span className="text-xs text-muted-foreground">
              {new Date(notification.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
        </div>
      </div>
    );
  };

  const renderNotificationIcon = (notification: Notification) => {
    switch (notification.notification_category) {
      case 'follow': return <UserPlus className="h-5 w-5 text-blue-500" />;
      case 'comment': case 'reply': return <MessageCircle className="h-5 w-5 text-blue-500" />;
      case 'reaction': case 'story_reaction': return <Heart className="h-5 w-5 text-red-500" />;
      case 'admin': case 'broadcast': return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'delivery': case 'marketplace': return <Bell className="h-5 w-5 text-green-500" />;
      case 'billing': return <Bell className="h-5 w-5 text-orange-500" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="text-center py-12">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 pb-20">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-6 w-6" />
              <span>Notifications</span>
              {notifications.filter((n) => !n.is_read).length > 0 && (
                <Badge variant="destructive">
                  {notifications.filter((n) => !n.is_read).length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {manageMode ? (
                <>
                  <Button size="sm" variant="outline" onClick={selectAll}>
                    {selectedIds.size === notifications.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setManageMode(false); setSelectedIds(new Set()); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setManageMode(true)}>
                  <Settings className="w-4 h-4 mr-1" />
                  Manage
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No notifications yet</div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    notification.is_read
                      ? 'bg-background hover:bg-muted/50'
                      : 'bg-primary/5 hover:bg-primary/10 border-primary/20'
                  } ${selectedIds.has(notification.id) ? 'ring-2 ring-primary' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    {manageMode && (
                      <Checkbox
                        checked={selectedIds.has(notification.id)}
                        onCheckedChange={() => toggleSelect(notification.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {renderNotificationContent(notification)}
                    </div>
                    {!['follow', 'comment', 'reply'].includes(notification.notification_category) && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(notification.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Notifications;
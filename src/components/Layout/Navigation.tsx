import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, MessageCircle, ShoppingBag, User, Users, Bell, Settings, TrendingUp, Menu, Star, Crown, Mail, Share2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [groupMsgCount, setGroupMsgCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    loadCounts();

    const channel = supabase
      .channel('nav-counts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user.id}` }, () => {
        setNotifCount(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${user.id}` }, () => {
        setChatCount(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Reset counts when visiting those pages
  useEffect(() => {
    if (location.pathname === '/notifications') setNotifCount(0);
    if (location.pathname === '/chat') setChatCount(0);
    if (location.pathname === '/groups') setGroupMsgCount(0);
  }, [location.pathname]);

  const loadCounts = async () => {
    if (!user) return;
    const { count: notifs } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read_receipt', false);
    setNotifCount(notifs || 0);

    const { count: chats } = await supabase
      .from('private_messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .is('read_at', null)
      .eq('is_deleted', false);
    setChatCount(chats || 0);
  };
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/', badge: 0 },
    { icon: Users, label: 'Groups', path: '/groups', badge: groupMsgCount },
    { icon: TrendingUp, label: 'Explore', path: '/explore', badge: 0 },
    { icon: MessageCircle, label: 'Chat', path: '/chat', badge: chatCount },
  ];

  const menuItems = [
    { icon: Bell, label: 'Notifications', path: '/notifications', badge: notifCount },
    { icon: ShoppingBag, label: 'Marketplace', path: '/marketplace' },
    { icon: Star, label: 'Buy Star To Earn', path: '/star-marketplace' },
    { icon: Crown, label: 'VIP Subscription', path: '/vip-subscription' },
    { icon: Star, label: 'Wallet', path: '/wallet' },
    { icon: User, label: 'Profile', path: '/profile' },
    { icon: Mail, label: 'Contact Admin', path: '/contact-admin' },
    { icon: Share2, label: 'Share Lernory', path: '/share' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map(({ icon: Icon, label, path, badge }) => {
          const isActive = location.pathname === path;
          const isHome = path === '/';
          return (
            <button
              key={path}
              onClick={() => {
                if (isHome && isActive) {
                  // Refresh the page when tapping Home while already on Home
                  window.location.reload();
                } else {
                  window.location.href = path;
                }
              }}
              className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors relative ${
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="relative">
                <Icon size={20} />
                {(badge ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {(badge ?? 0) > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="text-xs mt-1">{isHome && isActive ? '⟳ Refresh' : label}</span>
            </button>
          );
        })}
        
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              className="flex flex-col items-center justify-center flex-1 py-2 h-auto relative"
            >
              <div className="relative">
                <Menu size={20} />
                {notifCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </div>
              <span className="text-xs mt-1">Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[75vh]">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(75vh-5rem)] mt-4">
              <div className="space-y-2 pr-4">
                {menuItems.map(({ icon: Icon, label, path, badge }) => {
                  const isActive = location.pathname === path;
                  return (
                    <Link
                      key={path}
                      to={path}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 p-4 rounded-lg transition-colors ${
                        isActive 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      <Icon size={20} />
                      <span className="flex-1">{label}</span>
                      {badge && badge > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {badge > 99 ? '99+' : badge}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};

export default Navigation;
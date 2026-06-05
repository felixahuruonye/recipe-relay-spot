import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, ShoppingBag, User, Bell, Settings, Mail, Share2, Wallet, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    loadCounts();
    supabase.from('user_profiles').select('username, avatar_url').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data) { setAvatar(data.avatar_url || undefined); setUsername(data.username || ''); } });

    const channel = supabase
      .channel('nav-counts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${user.id}` }, () => setNotifCount(p => p + 1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${user.id}` }, () => setChatCount(p => p + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    if (location.pathname === '/notifications') setNotifCount(0);
    if (location.pathname === '/chat') setChatCount(0);
  }, [location.pathname]);

  const loadCounts = async () => {
    if (!user) return;
    const { count: notifs } = await supabase.from('user_notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read_receipt', false);
    setNotifCount(notifs || 0);
    const { count: chats } = await supabase.from('private_messages').select('*', { count: 'exact', head: true }).eq('to_user_id', user.id).is('read_at', null).eq('is_deleted', false);
    setChatCount(chats || 0);
  };

  const tabs = [
    { icon: Home, label: 'Watch', path: '/', badge: 0 },
    { icon: MessageCircle, label: 'Chat', path: '/chat', badge: chatCount },
    { icon: Wallet, label: 'Wallet', path: '/wallet', badge: 0 },
    { icon: ShoppingBag, label: 'Market', path: '/marketplace', badge: 0 },
  ];

  const profileMenu = [
    { icon: User, label: 'Profile', path: '/profile', desc: 'Your page & posts' },
    { icon: Bell, label: 'Activities', path: '/notifications', desc: 'Notifications', badge: notifCount },
    { icon: Mail, label: 'Contact Support', path: '/contact-admin', desc: 'Reach the Lenory team' },
    { icon: Share2, label: 'Share Lenory', path: '/share', desc: 'Invite your friends' },
    { icon: Settings, label: 'Settings', path: '/settings', desc: 'Privacy & preferences' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur border-t border-white/10 z-50">
      <div className="flex justify-around items-center h-16 px-1 max-w-[480px] mx-auto">
        {tabs.map(({ icon: Icon, label, path, badge }) => {
          const isActive = location.pathname === path || (path === '/' && location.pathname === '/index');
          const isWatch = path === '/';
          return (
            <button
              key={path}
              onClick={() => { if (isWatch && isActive) window.location.reload(); else navigate(path); }}
              className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors relative ${isActive ? 'text-white' : 'text-white/50 hover:text-white'}`}
            >
              <div className="relative">
                <Icon size={20} />
                {(badge ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {(badge ?? 0) > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5">{label}</span>
            </button>
          );
        })}

        <button
          onClick={() => navigate('/?create=post')}
          className="flex flex-col items-center justify-center flex-1 py-2 -mt-5 relative text-white/70"
        >
          <span className="w-14 h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
            <Plus className="w-7 h-7 text-primary-foreground" />
          </span>
          <span className="text-[11px] mt-0.5">Create</span>
        </button>

        <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
          <SheetTrigger asChild>
            <button className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors relative ${profileOpen ? 'text-white' : 'text-white/50 hover:text-white'}`}>
              <div className="relative">
                <Avatar className="w-6 h-6 ring-1 ring-primary/40">
                  <AvatarImage src={avatar} />
                  <AvatarFallback className="text-[10px]">{username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                {notifCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5">Profile</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <Avatar className="w-10 h-10"><AvatarImage src={avatar} /><AvatarFallback>{username?.[0]?.toUpperCase() || 'U'}</AvatarFallback></Avatar>
                <div className="text-left">
                  <p className="text-sm font-bold">@{username || 'me'}</p>
                  <p className="text-[11px] text-muted-foreground">Quick menu</p>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-1 gap-2 pb-4">
              {profileMenu.map(({ icon: Icon, label, path, desc, badge }) => {
                const isActive = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setProfileOpen(false)}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-border transition-colors ${isActive ? 'bg-primary/10 border-primary/40' : 'hover:bg-muted'}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight">{label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
                    </div>
                    {!!badge && badge > 0 && (
                      <Badge variant="destructive" className="text-[10px]">{badge > 99 ? '99+' : badge}</Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
};

export default Navigation;

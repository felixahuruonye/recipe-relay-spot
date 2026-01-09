import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

import { PrivateChat } from '@/components/Chat/PrivateChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

import { MessageCircle, Users } from 'lucide-react';

type ProfileMini = {
  id: string;
  username: string;
  avatar_url: string | null;
  vip: boolean | null;
  is_online: boolean | null;
  last_seen: string | null;
};

type Conversation = {
  partnerId: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

const Chat = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<ProfileMini[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const initializedFromNav = useRef(false);

  // Open chat if navigated from profile
  useEffect(() => {
    if (!user) return;
    if (initializedFromNav.current) return;

    if ((location.state as any)?.recipientId) {
      setSelectedPartnerId((location.state as any).recipientId);
    }
    initializedFromNav.current = true;
  }, [location.state, user]);

  useEffect(() => {
    if (!user) return;

    const boot = async () => {
      setLoading(true);
      await Promise.all([loadInbox(), loadOnlineUsers()]);
      setLoading(false);
    };

    boot();

    const ch1 = supabase
      .channel(`inbox-to-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${user.id}` },
        async (payload) => {
          const msg = payload.new as any;
          await handleNewMessage(msg);
        }
      )
      .subscribe();

    const ch2 = supabase
      .channel(`inbox-from-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `from_user_id=eq.${user.id}` },
        async (payload) => {
          const msg = payload.new as any;
          await handleNewMessage(msg);
        }
      )
      .subscribe();

    const chPresence = supabase
      .channel('presence-users')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles' }, () => loadOnlineUsers())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(chPresence);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadOnlineUsers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, vip, is_online, last_seen')
      .eq('is_online', true)
      .neq('id', user.id)
      .order('username')
      .limit(200);

    setOnlineUsers((data as any) || []);
  };

  const loadInbox = async () => {
    if (!user) return;

    // Pull recent messages and build conversations client-side (keeps DB simple)
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Inbox load error:', error);
      toast({ title: 'Error', description: 'Failed to load chats', variant: 'destructive' });
      return;
    }

    const msgs = (data as any[]) || [];

    const byPartner: Record<string, Conversation> = {};
    for (const m of msgs) {
      const partnerId = m.from_user_id === user.id ? m.to_user_id : m.from_user_id;
      if (!partnerId) continue;

      const prev = byPartner[partnerId];
      const createdAt = m.created_at;
      const isIncoming = m.to_user_id === user.id;

      if (!prev) {
        byPartner[partnerId] = {
          partnerId,
          lastMessage: m.message || '',
          lastAt: createdAt,
          unread: isIncoming && !m.read_at ? 1 : 0
        };
      } else {
        if (new Date(createdAt).getTime() > new Date(prev.lastAt).getTime()) {
          prev.lastAt = createdAt;
          prev.lastMessage = m.message || '';
        }
        if (isIncoming && !m.read_at) prev.unread += 1;
      }
    }

    const list = Object.values(byPartner).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    setConversations(list);

    const partnerIds = list.map((c) => c.partnerId);
    if (partnerIds.length) {
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, vip, is_online, last_seen')
        .in('id', partnerIds);
      const map: Record<string, ProfileMini> = {};
      (profs as any as ProfileMini[] | null)?.forEach((p) => (map[p.id] = p));
      setProfiles(map);
    } else {
      setProfiles({});
    }
  };

  const handleNewMessage = async (msg: any) => {
    if (!user) return;

    const partnerId = msg.from_user_id === user.id ? msg.to_user_id : msg.from_user_id;
    if (!partnerId) return;

    // Ensure partner profile exists
    if (!profiles[partnerId]) {
      const { data: p } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url, vip, is_online, last_seen')
        .eq('id', partnerId)
        .single();
      if (p) setProfiles((prev) => ({ ...prev, [partnerId]: p as any }));
    }

    setConversations((prev) => {
      const existing = prev.find((c) => c.partnerId === partnerId);
      const unreadInc = msg.to_user_id === user.id && !msg.read_at && partnerId !== selectedPartnerId ? 1 : 0;

      const next: Conversation = {
        partnerId,
        lastMessage: msg.message || '',
        lastAt: msg.created_at,
        unread: (existing?.unread || 0) + unreadInc
      };

      const filtered = prev.filter((c) => c.partnerId !== partnerId);
      return [next, ...filtered];
    });

    // Toast popup on any new incoming message (when not currently inside that chat)
    if (msg.to_user_id === user.id && partnerId !== selectedPartnerId) {
      const name = profiles[partnerId]?.username || 'New message';
      toast({
        title: name,
        description: msg.message?.slice(0, 120) || 'New message received'
      });
    }
  };

  const filteredConvos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (profiles[c.partnerId]?.username || '').toLowerCase().includes(q));
  }, [conversations, search, profiles]);

  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + (c.unread || 0), 0), [conversations]);

  const selectPartner = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    // Reset unread for that conversation in UI (messages are marked read in PrivateChat)
    setConversations((prev) => prev.map((c) => (c.partnerId === partnerId ? { ...c, unread: 0 } : c)));
  };

  if (!user) return null;

  if (selectedPartnerId) {
    const p = profiles[selectedPartnerId];
    return (
      <div className="h-[calc(100vh-64px)]">
        <PrivateChat
          recipientId={selectedPartnerId}
          recipientName={p?.username || 'Chat'}
          recipientAvatar={p?.avatar_url || ''}
          onBack={() => setSelectedPartnerId(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <header className="bg-card border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Chats</h1>
            <div className="text-xs text-muted-foreground">{totalUnread ? `${totalUnread} unread` : 'Up to date'}</div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Users className="w-3 h-3" />
              {onlineUsers.length} online
            </Badge>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">Online</Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle>Online now</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] pr-2 mt-4">
                  <div className="space-y-2">
                    {onlineUsers.map((u) => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent text-left"
                        onClick={() => selectPartner(u.id)}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.avatar_url || ''} />
                          <AvatarFallback>{u.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{u.username}</div>
                            {u.vip ? <Badge variant="secondary">VIP</Badge> : null}
                          </div>
                        </div>
                      </button>
                    ))}
                    {onlineUsers.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No one is online right now.</div>
                    ) : null}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="mt-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading chats…</div>
        ) : filteredConvos.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <div className="font-medium">No chats yet</div>
            <div className="text-sm">Open "Online" to start a conversation.</div>
          </div>
        ) : (
          <div className="divide-y">
            {filteredConvos.map((c) => {
              const p = profiles[c.partnerId];
              return (
                <button
                  key={c.partnerId}
                  className="w-full p-4 flex items-center gap-3 hover:bg-accent text-left"
                  onClick={() => selectPartner(c.partnerId)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={p?.avatar_url || ''} />
                    <AvatarFallback>{p?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-semibold truncate">{p?.username || c.partnerId}</div>
                        {p?.vip ? <Badge variant="secondary">VIP</Badge> : null}
                        {p?.is_online ? <Badge variant="outline">Online</Badge> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(c.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="text-sm text-muted-foreground truncate">{c.lastMessage}</div>
                      {c.unread ? <Badge variant="default">{c.unread}</Badge> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Chat;

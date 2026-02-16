import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ArrowLeft, Eye, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Message {
  id: string;
  user_id: string;
  message: string;
  media_url?: string;
  created_at: string;
  user_profiles?: {
    username: string;
    avatar_url: string;
  };
}

interface GroupChatProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

interface ReadReceipt {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

export const GroupChat: React.FC<GroupChatProps> = ({ groupId, groupName, onBack }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [memberStatus, setMemberStatus] = useState<'checking' | 'none' | 'pending' | 'active'>('checking');
  const [memberCount, setMemberCount] = useState(0);
  const [readReceiptMsg, setReadReceiptMsg] = useState<string | null>(null);
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
  const [readReceiptsLoading, setReadReceiptsLoading] = useState(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const run = async () => {
      if (!user) {
        setMemberStatus('none');
        return;
      }

      setMemberStatus('checking');

      // Check if user is the group owner
      const { data: groupData } = await supabase
        .from('groups')
        .select('owner_id')
        .eq('id', groupId)
        .single();

      if (groupData?.owner_id === user.id) {
        const { data: existingMember } = await supabase
          .from('group_members')
          .select('id')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!existingMember) {
          await supabase.from('group_members').insert({
            group_id: groupId,
            user_id: user.id,
            role: 'owner',
            status: 'active',
          });
        }

        setMemberStatus('active');
        await loadMessages();
        await loadMemberCount();
        channel = setupRealtimeSubscription();
        return;
      }

      const { data, error } = await supabase
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking membership:', error);
        setMemberStatus('none');
        return;
      }

      const status = (data?.status as any) || 'none';
      if (status === 'active') {
        setMemberStatus('active');
        await loadMessages();
        await loadMemberCount();
        channel = setupRealtimeSubscription();
      } else if (status === 'pending') {
        setMemberStatus('pending');
        setMessages([]);
      } else {
        setMemberStatus('none');
        setMessages([]);
      }
    };

    run();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const canChat = useMemo(() => memberStatus === 'active', [memberStatus]);

  const loadMemberCount = async () => {
    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'active');
    setMemberCount(count || 0);
  };

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      console.error('Error loading messages:', error);
      toast({ title: 'Unable to load messages', description: error.message, variant: 'destructive' });
      return;
    }

    const userIds = [...new Set(data?.map(m => m.user_id) || [])];
    let profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      profileMap = new Map((profiles || []).map(p => [p.id, p]));
    }

    const messagesWithProfiles = data?.map(msg => ({
      ...msg,
      user_profiles: profileMap.get(msg.user_id)
    })) || [];

    setMessages(messagesWithProfiles);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          setMessages((prev) => [...prev, { ...payload.new, user_profiles: profile } as Message]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return channel;
  };

  const sendMessage = async () => {
    if (!user || !newMessage.trim() || !canChat) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('group_messages')
        .insert({ group_id: groupId, user_id: user.id, message: newMessage.trim() });
      if (error) throw error;
      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({ title: 'Error', description: error.message || 'Failed to send message', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      const { error } = await supabase.from('group_messages').delete().eq('id', id);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete message', variant: 'destructive' });
    }
  };

  const showReadReceipts = async (msgId: string) => {
    setReadReceiptMsg(msgId);
    setReadReceiptsLoading(true);
    try {
      // For "audience reached", show all active members as potential readers
      // In a real system you'd have a message_reads table; here we show all active members
      const { data } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('status', 'active');

      if (data && data.length > 0) {
        const memberIds = data.map(m => m.user_id).filter(id => id !== user?.id);
        if (memberIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, avatar_url')
            .in('id', memberIds);
          setReadReceipts((profiles || []).map(p => ({ user_id: p.id, username: p.username, avatar_url: p.avatar_url })));
        } else {
          setReadReceipts([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReadReceiptsLoading(false);
    }
  };

  const navigateToProfile = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100dvh - 4rem)' }}>
      {/* Header */}
      <div className="flex items-center space-x-3 p-4 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-lg truncate">{groupName}</h2>
          <p className="text-xs text-muted-foreground">{memberCount} members</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {memberStatus === 'checking' ? (
          <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
        ) : memberStatus === 'pending' ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Your join request is pending approval by the group owner.
          </div>
        ) : memberStatus === 'none' ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            You're not an active member of this group yet.
          </div>
        ) : (
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">No messages yet. Say hi! 👋</div>
            )}
            {messages.map((msg) => {
              const isOwn = msg.user_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar
                    className="w-8 h-8 shrink-0 cursor-pointer"
                    onClick={() => navigateToProfile(msg.user_id)}
                  >
                    <AvatarImage src={msg.user_profiles?.avatar_url} />
                    <AvatarFallback>{msg.user_profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                    {!isOwn && (
                      <span
                        className="text-xs text-muted-foreground mb-1 cursor-pointer hover:underline"
                        onClick={() => navigateToProfile(msg.user_id)}
                      >
                        {msg.user_profiles?.username}
                      </span>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2 break-words ${
                        isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}
                    >
                      {msg.message}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isOwn && (
                        <>
                          <button
                            onClick={() => showReadReceipts(msg.id)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Seen</span>
                          </button>
                          <button
                            onClick={() => deleteMessage(msg.id)}
                            className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Message Input - always visible for active members */}
      {canChat && (
        <div className="p-3 border-t shrink-0 bg-background">
          <div className="flex items-center gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim() || loading} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Read Receipts Dialog */}
      <Dialog open={!!readReceiptMsg} onOpenChange={() => setReadReceiptMsg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Audience Reached ({readReceipts.length})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {readReceiptsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
            ) : readReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No other members yet</p>
            ) : (
              readReceipts.map((r) => (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => { setReadReceiptMsg(null); navigateToProfile(r.user_id); }}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={r.avatar_url || ''} />
                    <AvatarFallback>{r.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{r.username}</span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

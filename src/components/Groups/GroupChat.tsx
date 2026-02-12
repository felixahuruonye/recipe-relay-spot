import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export const GroupChat: React.FC<GroupChatProps> = ({ groupId, groupName, onBack }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [memberStatus, setMemberStatus] = useState<'checking' | 'none' | 'pending' | 'active'>('checking');

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const run = async () => {
      if (!user) {
        setMemberStatus('none');
        return;
      }

      setMemberStatus('checking');

      // First check if user is the group owner (always active)
      const { data: groupData } = await supabase
        .from('groups')
        .select('owner_id')
        .eq('id', groupId)
        .single();

      if (groupData?.owner_id === user.id) {
        // Owner is always active — ensure membership row exists
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

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error loading messages:', error);
      toast({
        title: 'Unable to load messages',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    // Fetch user profiles separately
    const userIds = [...new Set(data?.map(m => m.user_id) || [])];
    let profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);
      if (profilesError) console.error('Error loading profiles:', profilesError);
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
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`
        },
        async (payload) => {
          // Fetch user profile for the new message
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          setMessages((prev) => [...prev, {
            ...payload.new,
            user_profiles: profile
          } as Message]);
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
        .insert({
          group_id: groupId,
          user_id: user.id,
          message: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = async (id: string) => {
    try {
      const { error } = await supabase
        .from('group_messages')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      console.error('Error deleting message:', error);
      toast({ title: 'Error', description: 'Failed to delete message', variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="flex items-center space-x-3 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-semibold text-lg">{groupName}</h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 min-h-0">
        {memberStatus === 'checking' ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : memberStatus === 'pending' ? (
          <div className="text-sm text-muted-foreground">
            Your join request is pending approval by the group owner.
          </div>
        ) : memberStatus === 'none' ? (
          <div className="text-sm text-muted-foreground">
            You’re not an active member of this group yet.
          </div>
        ) : (
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-sm text-muted-foreground">No messages yet. Say hi.</div>
            ) : null}
            {messages.map((msg) => {
              const isOwnMessage = msg.user_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-2 ${isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''}`}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={msg.user_profiles?.avatar_url} />
                    <AvatarFallback>{msg.user_profiles?.username?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                    {!isOwnMessage && (
                      <span className="text-xs text-muted-foreground mb-1">
                        {msg.user_profiles?.username}
                      </span>
                    )}
                    <div
                      className={`rounded-lg px-4 py-2 max-w-xs break-words ${
                        isOwnMessage
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.message}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isOwnMessage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs mt-1"
                        onClick={() => deleteMessage(msg.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex items-center space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={loading || !canChat}
          />
          <Button onClick={sendMessage} disabled={!newMessage.trim() || loading || !canChat}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PrivateChatProps {
  recipientId: string;
  recipientName: string;
  recipientAvatar: string;
  onBack: () => void;
}

interface PrivateMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

export const PrivateChat: React.FC<PrivateChatProps> = ({ 
  recipientId, 
  recipientName, 
  recipientAvatar,
  onBack 
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    fetchMessages();
    const cleanup = setupRealtimeSubscription();
    markMessagesAsRead();

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, recipientId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('private_messages')
        .select('*')
        .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${recipientId}),and(from_user_id.eq.${recipientId},to_user_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user) return () => undefined;

    const channel = supabase
      .channel(`private-messages-${user.id}-${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `to_user_id=eq.${user.id}`
        },
        (payload) => {
          const newMsg = payload.new as PrivateMessage;
          if (newMsg.from_user_id === recipientId) {
            setMessages((prev) => [...prev, newMsg]);
            markMessagesAsRead();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `to_user_id=eq.${recipientId}`
        },
        (payload) => {
          const newMsg = payload.new as PrivateMessage;
          if (newMsg.from_user_id === user.id) {
            setMessages((prev) => [...prev, newMsg]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };
  const markMessagesAsRead = async () => {
    if (!user) return;

    await supabase
      .from('private_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('to_user_id', user.id)
      .eq('from_user_id', recipientId)
      .is('read_at', null);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;

    const optimistic: PrivateMessage = {
      id: `temp-${Date.now()}`,
      from_user_id: user.id,
      to_user_id: recipientId,
      message: newMessage.trim(),
      created_at: new Date().toISOString(),
      read_at: null
    };

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('private_messages')
        .insert({
          from_user_id: user.id,
          to_user_id: recipientId,
          message: optimistic.message
        })
        .select('*')
        .single();

      if (error) throw error;

      // Replace optimistic message with real one
      if (data?.id) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? (data as any as PrivateMessage) : m)));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
      // Remove optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setNewMessage(optimistic.message);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('private_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({ title: "Success", description: "Message deleted" });
    } catch (error) {
      console.error('Error deleting message:', error);
      toast({
        title: "Error",
        description: "Failed to delete message",
        variant: "destructive"
      });
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-card border-b p-4 flex items-center space-x-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="w-10 h-10">
          <AvatarImage src={recipientAvatar} />
          <AvatarFallback>
            {recipientName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-semibold">{recipientName}</h3>
          <p className="text-xs text-muted-foreground">Private Chat</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((message) => {
              const isFromMe = message.from_user_id === user?.id;
              return (
                <div
                  key={message.id}
                  className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} group`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 relative ${
                      isFromMe
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm">{message.message}</p>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <p
                        className={`text-xs ${
                          isFromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}
                      >
                        {formatTime(message.created_at)}
                      </p>
                      {isFromMe && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteMessage(message.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <form onSubmit={sendMessage} className="flex space-x-2">
          <Input
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1"
            maxLength={500}
          />
          <Button type="submit" disabled={!newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

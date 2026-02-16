import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ArrowLeft, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploader } from './FileUploader';
import { MediaMessage } from './MediaMessage';

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
  media_url?: string | null;
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
  const [recipientOnline, setRecipientOnline] = useState(false);
  const [recipientIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    fetchMessages();
    const cleanup = setupRealtimeSubscription();
    markMessagesAsRead();
    checkRecipientStatus();
    return cleanup;
  }, [user?.id, recipientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkRecipientStatus = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('is_online')
      .eq('id', recipientId)
      .single();
    setRecipientOnline(data?.is_online || false);
  };

  const fetchMessages = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${recipientId}),and(from_user_id.eq.${recipientId},to_user_id.eq.${user.id})`)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    if (!error) setMessages(data || []);
    setLoading(false);
  };

  const setupRealtimeSubscription = () => {
    if (!user) return () => undefined;
    const channel = supabase
      .channel(`private-messages-${user.id}-${recipientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${user.id}` }, (payload) => {
        const newMsg = payload.new as PrivateMessage;
        if (newMsg.from_user_id === recipientId) {
          setMessages(prev => [...prev, newMsg]);
          markMessagesAsRead();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${recipientId}` }, (payload) => {
        const newMsg = payload.new as PrivateMessage;
        if (newMsg.from_user_id === user.id) {
          setMessages(prev => [...prev, newMsg]);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'private_messages' }, (payload) => {
        const updated = payload.new as PrivateMessage;
        if ((updated as any).is_deleted) {
          setMessages(prev => prev.filter(m => m.id !== updated.id));
        } else {
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${recipientId}` }, (payload) => {
        setRecipientOnline((payload.new as any).is_online || false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  const handleTyping = () => {
    if (!isTyping) setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;
    const msg = newMessage.trim();
    setNewMessage('');
    setIsTyping(false);

    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: recipientId,
      message: msg
    });
    if (error) toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
  };

  const sendMedia = async (url: string, type?: string) => {
    if (!user) return;
    await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: recipientId,
      message: type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : type === 'document' ? '📄 Document' : '🎤 Voice message',
      media_url: url,
    });
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('private_messages').update({ is_deleted: true }).eq('id', messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
    toast({ title: "Deleted", description: "Message deleted" });
  };

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getMessageStatus = (message: PrivateMessage) => {
    if (message.from_user_id !== user?.id) return null;
    return message.read_at ? <CheckCheck className="w-4 h-4 text-blue-500" /> : <Check className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 4rem)' }}>
      {/* Header */}
      <div className="bg-card border-b p-3 flex items-center space-x-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <Avatar className="w-9 h-9">
          <AvatarImage src={recipientAvatar} />
          <AvatarFallback>{recipientName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{recipientName}</h3>
          <div className="flex items-center gap-2">
            {recipientOnline ? (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">Online</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">Offline</span>
            )}
            {recipientIsTyping && <span className="text-xs text-muted-foreground animate-pulse">typing...</span>}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message) => {
              const isFromMe = message.from_user_id === user?.id;
              return (
                <div key={message.id} className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isFromMe ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {message.media_url && <MediaMessage url={message.media_url} isOwn={isFromMe} />}
                    {message.message && !message.media_url && <p className="text-sm break-words">{message.message}</p>}
                    {message.media_url && message.message && <p className="text-xs mt-1 opacity-70">{message.message}</p>}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className={`text-xs ${isFromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {formatTime(message.created_at)}
                      </span>
                      {getMessageStatus(message)}
                      {isFromMe && (
                        <button onClick={() => deleteMessage(message.id)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8 text-sm">No messages yet. Say hi!</div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t shrink-0 bg-background">
        <form onSubmit={sendMessage} className="flex items-center gap-1">
          <FileUploader onFileUploaded={(url, type) => sendMedia(url, type)} />
          <VoiceRecorder onVoiceSent={(url) => sendMedia(url)} />
          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
            className="flex-1"
            maxLength={500}
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

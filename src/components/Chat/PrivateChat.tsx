import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, ArrowLeft, Check, CheckCheck, Trash2, Info, Search, X, Timer, BellOff, ShieldAlert, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploader } from './FileUploader';
import { MediaMessage } from './MediaMessage';
import { getChatTheme, disappearingLabel } from '@/lib/chatTheme';

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
  is_system?: boolean | null;
  expires_at?: string | null;
}

export const PrivateChat: React.FC<PrivateChatProps> = ({
  recipientId, recipientName, recipientAvatar, onBack
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [recipientOnline, setRecipientOnline] = useState(false);
  const [prefs, setPrefs] = useState<any>({ theme_key: 'Default', disappearing_duration: 'off', read_receipts_enabled: true, typing_indicator_enabled: true });
  const [globalReceipts, setGlobalReceipts] = useState(true);
  const [blocked, setBlocked] = useState<{ byMe: boolean; byThem: boolean }>({ byMe: false, byThem: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const partnerTypingTimeout = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<any>(null);
  const { toast } = useToast();

  const theme = getChatTheme(prefs.theme_key);
  const isBlocked = blocked.byMe || blocked.byThem;
  const restrictedUntil = prefs.restricted_until && new Date(prefs.restricted_until) > new Date() ? prefs.restricted_until : null;
  const mutedUntil = prefs.muted_until && new Date(prefs.muted_until) > new Date() ? prefs.muted_until : null;

  /* ---------------- data loading ---------------- */

  const loadPrefs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_preferences').select('*')
      .eq('user_id', user.id).eq('partner_id', recipientId).maybeSingle();
    if (data) setPrefs((p: any) => ({ ...p, ...data }));

    const { data: g } = await supabase
      .from('user_messaging_settings').select('global_read_receipts').eq('user_id', user.id).maybeSingle();
    if (g) setGlobalReceipts(!!g.global_read_receipts);
  }, [user?.id, recipientId]);

  const loadBlocks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('blocked_users').select('blocker_id,blocked_id')
      .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${user.id})`);
    const rows = data || [];
    setBlocked({
      byMe: rows.some((r: any) => r.blocker_id === user.id),
      byThem: rows.some((r: any) => r.blocker_id === recipientId),
    });
  }, [user?.id, recipientId]);

  const fetchMessages = useCallback(async () => {
    if (!user) return;
    await supabase.rpc('purge_expired_private_messages' as any);
    const { data, error } = await supabase
      .from('private_messages')
      .select('*')
      .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${recipientId}),and(from_user_id.eq.${recipientId},to_user_id.eq.${user.id})`)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    if (!error) setMessages((data as any) || []);
    setLoading(false);
  }, [user?.id, recipientId]);

  const checkRecipientStatus = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles').select('is_online, last_seen').eq('id', recipientId).maybeSingle();
    const lastSeen = data?.last_seen ? new Date(data.last_seen).getTime() : 0;
    setRecipientOnline(!!(data?.is_online && (Date.now() - lastSeen) < 120000));
  }, [recipientId]);

  const markMessagesAsRead = useCallback(async () => {
    if (!user) return;
    if (!globalReceipts || prefs.read_receipts_enabled === false) return;
    await supabase.from('private_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('to_user_id', user.id).eq('from_user_id', recipientId).is('read_at', null);
  }, [user?.id, recipientId, globalReceipts, prefs.read_receipts_enabled]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    loadPrefs();
    loadBlocks();
    fetchMessages();
    checkRecipientStatus();
  }, [user?.id, recipientId, loadPrefs, loadBlocks, fetchMessages, checkRecipientStatus]);

  useEffect(() => { markMessagesAsRead(); }, [markMessagesAsRead, messages.length]);

  /* ---------------- realtime ---------------- */

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`private-messages-${user.id}-${recipientId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${user.id}` }, (payload) => {
        const newMsg = payload.new as PrivateMessage;
        if (newMsg.from_user_id === recipientId) setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages', filter: `to_user_id=eq.${recipientId}` }, (payload) => {
        const newMsg = payload.new as PrivateMessage;
        if (newMsg.from_user_id === user.id) setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'private_messages' }, (payload) => {
        const updated = payload.new as any;
        if (updated.is_deleted) setMessages(prev => prev.filter(m => m.id !== updated.id));
        else setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles', filter: `id=eq.${recipientId}` }, (payload) => {
        const p = payload.new as any;
        const lastSeen = p.last_seen ? new Date(p.last_seen).getTime() : 0;
        setRecipientOnline(!!(p.is_online && (Date.now() - lastSeen) < 120000));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_preferences', filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as any;
        if (row?.partner_id === recipientId) setPrefs((p: any) => ({ ...p, ...row }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, recipientId]);

  // typing indicator over realtime broadcast
  useEffect(() => {
    if (!user) return;
    const room = [user.id, recipientId].sort().join('__');
    const ch = supabase.channel(`typing-${room}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId !== recipientId) return;
        setPartnerTyping(true);
        if (partnerTypingTimeout.current) clearTimeout(partnerTypingTimeout.current);
        partnerTypingTimeout.current = setTimeout(() => setPartnerTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); typingChannelRef.current = null; };
  }, [user?.id, recipientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerTyping]);

  // expire disappearing messages locally
  useEffect(() => {
    if ((prefs.disappearing_duration || 'off') === 'off') return;
    const t = setInterval(() => {
      setMessages(prev => prev.filter(m => !m.expires_at || new Date(m.expires_at) > new Date()));
    }, 15000);
    return () => clearInterval(t);
  }, [prefs.disappearing_duration]);

  /* ---------------- actions ---------------- */

  const handleTyping = () => {
    if (prefs.typing_indicator_enabled === false || !user) return;
    if (typingTimeoutRef.current) return;
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id } });
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 1500);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;
    if (isBlocked) {
      toast({ title: 'Cannot send', description: blocked.byMe ? 'You blocked this account.' : 'You can no longer message this account.', variant: 'destructive' });
      return;
    }
    const msg = newMessage.trim();
    setNewMessage('');
    const { error } = await supabase.from('private_messages').insert({
      from_user_id: user.id, to_user_id: recipientId, message: msg
    });
    if (error) {
      setNewMessage(msg);
      const isBlockErr = error.message?.includes('BLOCKED');
      if (isBlockErr) loadBlocks();
      toast({ title: 'Error', description: isBlockErr ? 'You cannot message this account.' : 'Failed to send message', variant: 'destructive' });
    }
  };

  const sendMedia = async (url: string, type?: string) => {
    if (!user || isBlocked) return;
    await supabase.from('private_messages').insert({
      from_user_id: user.id, to_user_id: recipientId,
      message: type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : type === 'document' ? '📄 Document' : '🎤 Voice message',
      media_url: url,
    });
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('private_messages').update({ is_deleted: true }).eq('id', messageId);
    setMessages(prev => prev.filter(m => m.id !== messageId));
    toast({ title: 'Deleted', description: 'Message deleted' });
  };

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getMessageStatus = (message: PrivateMessage) => {
    if (message.from_user_id !== user?.id) return null;
    return message.read_at ? <CheckCheck className="w-4 h-4 text-blue-500" /> : <Check className="w-4 h-4 opacity-60" />;
  };

  const visibleMessages = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchOpen || !q) return messages;
    return messages.filter(m => (m.message || '').toLowerCase().includes(q));
  }, [messages, query, searchOpen]);

  const highlight = (text: string) => {
    const q = query.trim();
    if (!searchOpen || !q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-400/60 text-inherit rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 5.5rem)' }}>
      {/* Header */}
      <div className="bg-card border-b p-3 flex items-center space-x-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="relative">
          <Avatar className="w-9 h-9">
            {!blocked.byMe && <AvatarImage src={recipientAvatar} />}
            <AvatarFallback>{recipientName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          {recipientOnline && !isBlocked && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{recipientName}</h3>
          <div className="flex items-center gap-2">
            {partnerTyping ? (
              <span className="text-xs text-primary">typing…</span>
            ) : isBlocked ? (
              <span className="text-xs text-destructive">Blocked</span>
            ) : recipientOnline ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Active now
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Offline</span>
            )}
            {mutedUntil && <BellOff className="w-3 h-3 text-muted-foreground" />}
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Search in conversation" onClick={() => { setSearchOpen(v => !v); setQuery(''); }}>
          {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Chat settings" onClick={() => navigate(`/chat/${recipientId}/settings`)}>
          <Info className="h-5 w-5" />
        </Button>
      </div>

      {searchOpen && (
        <div className="p-2 border-b shrink-0 bg-card">
          <Input autoFocus placeholder="Search in this conversation…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query.trim() && (
            <div className="text-xs text-muted-foreground mt-1 px-1">{visibleMessages.length} result(s)</div>
          )}
        </div>
      )}

      {(prefs.disappearing_duration && prefs.disappearing_duration !== 'off') && (
        <div className="flex items-center justify-center gap-2 text-xs py-1.5 bg-muted/50 border-b shrink-0">
          <Timer className="w-3 h-3" /> Disappearing messages: {disappearingLabel(prefs.disappearing_duration)}
        </div>
      )}
      {restrictedUntil && (
        <div className="flex items-center justify-center gap-2 text-xs py-1.5 bg-amber-500/15 text-amber-500 border-b shrink-0">
          <ShieldAlert className="w-3 h-3" /> Restricted until {new Date(restrictedUntil).toLocaleDateString()}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0" style={{ background: theme.bg }}>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : visibleMessages.length > 0 ? (
          <div className="space-y-3">
            {visibleMessages.map((message) => {
              if (message.is_system) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <span className="text-[11px] px-3 py-1 rounded-full bg-muted text-muted-foreground">{message.message}</span>
                  </div>
                );
              }
              const isFromMe = message.from_user_id === user?.id;
              return (
                <div key={message.id} className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} group`}>
                  <div
                    className="max-w-[75%] rounded-2xl px-3 py-2"
                    style={{
                      background: isFromMe ? theme.mine : theme.theirs,
                      color: isFromMe ? theme.mineText : theme.theirsText,
                    }}
                  >
                    {message.media_url && <MediaMessage url={message.media_url} isOwn={isFromMe} />}
                    {message.message && !message.media_url && <p className="text-sm break-words">{highlight(message.message)}</p>}
                    {message.media_url && message.message && <p className="text-xs mt-1 opacity-70">{message.message}</p>}
                    <div className="flex items-center justify-end gap-1 mt-1 opacity-80">
                      <span className="text-xs">{formatTime(message.created_at)}</span>
                      {message.expires_at && <Timer className="w-3 h-3" />}
                      {getMessageStatus(message)}
                      <button onClick={() => deleteMessage(message.id)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {partnerTyping && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 flex gap-1" style={{ background: theme.theirs }}>
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8 text-sm">
            {searchOpen && query.trim() ? 'No messages match your search.' : 'No messages yet. Say hi!'}
          </div>
        )}
      </div>

      {/* Composer */}
      {isBlocked ? (
        <div className="p-4 border-t shrink-0 bg-background text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Ban className="w-4 h-4" />
          {blocked.byMe ? 'You blocked this account. Unblock to send messages.' : 'You can no longer message this account.'}
        </div>
      ) : (
        <div className="p-3 pb-5 border-t shrink-0 bg-background mb-2">
          <form onSubmit={sendMessage} className="flex items-center gap-1">
            <FileUploader onFileUploaded={(url, type) => sendMedia(url, type)} />
            <VoiceRecorder onVoiceSent={(url) => sendMedia(url, 'voice')} />
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
      )}
    </div>
  );
};

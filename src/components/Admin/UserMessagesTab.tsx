import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Send, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface ContactMessage {
  id: string;
  user_id: string;
  user_uuid: string | null;
  question: string;
  status: string;
  admin_response: string | null;
  asked_at: string;
  user_email: string;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export const UserMessagesTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [response, setResponse] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();
    
    // Real-time updates
    const channel = supabase
      .channel('admin-user-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_questions' }, () => loadMessages())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMessages = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('admin_questions')
      .select('*')
      .order('asked_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setMessages(data || []);

    // Fetch user profiles
    const userUuids = [...new Set((data || []).map(m => m.user_uuid).filter(Boolean))];
    if (userUuids.length > 0) {
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userUuids);

      const map: Record<string, Profile> = {};
      profs?.forEach(p => { map[p.id] = p; });
      setProfiles(map);
    }

    setLoading(false);
  };

  const sendResponse = async () => {
    if (!selectedMessage || !response.trim()) return;

    setSending(true);

    // Update the question with admin response
    const { error: updateError } = await supabase
      .from('admin_questions')
      .update({ 
        admin_response: response.trim(),
        status: 'answered',
        answered_at: new Date().toISOString()
      })
      .eq('id', selectedMessage.id);

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
      setSending(false);
      return;
    }

    // Send notification to user
    if (selectedMessage.user_uuid) {
      await supabase.from('user_notifications').insert({
        user_id: selectedMessage.user_uuid,
        title: 'Admin Response',
        message: response.trim(),
        type: 'admin_message',
        notification_category: 'admin'
      });
    }

    toast({ title: 'Sent', description: 'Response sent to user.' });
    setResponse('');
    setSelectedMessage(null);
    setSending(false);
    loadMessages();
  };

  const pendingCount = messages.filter(m => m.status === 'pending').length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <CardTitle>User Messages</CardTitle>
          {pendingCount > 0 && (
            <Badge variant="destructive">{pendingCount} pending</Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={loadMessages}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No contact messages yet.</div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const profile = msg.user_uuid ? profiles[msg.user_uuid] : null;
              return (
                <div 
                  key={msg.id} 
                  className={`p-4 rounded-lg border ${msg.status === 'pending' ? 'border-primary/50 bg-primary/5' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback>{profile?.username?.[0] || msg.user_email?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{profile?.username || msg.user_email || 'Unknown'}</span>
                        <Badge variant={msg.status === 'pending' ? 'default' : 'secondary'}>
                          {msg.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.asked_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{msg.question}</p>
                      
                      {msg.admin_response && (
                        <div className="mt-2 p-2 bg-muted rounded text-sm">
                          <span className="text-muted-foreground">Your response: </span>
                          {msg.admin_response}
                        </div>
                      )}

                      {msg.status === 'pending' && (
                        <div className="mt-3">
                          {selectedMessage?.id === msg.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={response}
                                onChange={(e) => setResponse(e.target.value)}
                                placeholder="Type your response..."
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  onClick={sendResponse}
                                  disabled={sending || !response.trim()}
                                >
                                  <Send className="w-4 h-4 mr-2" />
                                  {sending ? 'Sending...' : 'Send Response'}
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedMessage(null);
                                    setResponse('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setSelectedMessage(msg)}
                            >
                              Reply
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Megaphone, Send, History, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type BroadcastType = 'info' | 'success' | 'warning' | 'error';

interface BroadcastHistory {
  id: string;
  title: string;
  message: string;
  created_at: string;
}

export const BroadcastTab: React.FC = () => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<BroadcastType>('info');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<BroadcastHistory[]>([]);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    loadHistory();
    loadUserCount();
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from('general_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    
    setHistory(data || []);
  };

  const loadUserCount = async () => {
    const { count } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    
    setUserCount(count || 0);
  };

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: 'Missing info', description: 'Title and message are required.', variant: 'destructive' });
      return;
    }

    setSending(true);

    try {
      // Save to general_messages table
      const { error: msgError } = await supabase.from('general_messages').insert({
        title: title.trim(),
        message: message.trim()
      });

      if (msgError) {
        console.error('Error saving to general_messages:', msgError);
      }

      // Get all user IDs
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select('id');

      if (usersError) {
        throw usersError;
      }

      if (!users || users.length === 0) {
        toast({ title: 'No users', description: 'No users to send broadcast to.', variant: 'destructive' });
        setSending(false);
        return;
      }

      // Create notifications for all users in batches
      const notifications = users.map(u => ({
        user_id: u.id,
        title: title.trim(),
        message: message.trim(),
        type: 'broadcast',
        notification_category: 'broadcast'
      }));

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const { error } = await supabase.from('user_notifications').insert(batch);
        if (error) {
          console.error('Batch insert error:', error);
        }
      }

      toast({ 
        title: 'Broadcast sent!', 
        description: `Message sent to ${users.length} users.` 
      });
      
      setTitle('');
      setMessage('');
      setType('info');
      loadHistory();
    } catch (error: any) {
      console.error('Broadcast error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to send broadcast', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            Broadcast Message
            <Badge variant="secondary" className="ml-2">
              <Users className="w-3 h-3 mr-1" />
              {userCount} users
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Title</div>
            <Input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              maxLength={80} 
              placeholder="e.g., Maintenance notice, New Feature!" 
            />
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">Type</div>
            <Select value={type} onValueChange={(v) => setType(v as BroadcastType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">ℹ️ Info</SelectItem>
                <SelectItem value="success">✅ Success</SelectItem>
                <SelectItem value="warning">⚠️ Warning</SelectItem>
                <SelectItem value="error">❌ Error/Alert</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">Message</div>
            <Textarea 
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              rows={6} 
              maxLength={1000} 
              placeholder="Write your message to all users…" 
            />
            <div className="text-xs text-muted-foreground mt-1">{message.length}/1000</div>
          </div>

          <div className="flex justify-end">
            <Button onClick={send} disabled={sending} className="min-w-[150px]">
              {sending ? (
                'Sending…'
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send to All Users
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Broadcast History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Recent Broadcasts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No broadcasts sent yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
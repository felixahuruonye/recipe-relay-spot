import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type BroadcastType = 'info' | 'success' | 'warning' | 'error';

export const BroadcastTab: React.FC = () => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<BroadcastType>('info');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: 'Missing info', description: 'Title and message are required.', variant: 'destructive' });
      return;
    }

    setSending(true);
    const { error } = await supabase.rpc('admin_send_broadcast', {
      p_title: title.trim(),
      p_message: message.trim(),
      p_type: type
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSending(false);
      return;
    }

    toast({ title: 'Broadcast sent', description: 'All users will see this in notifications.' });
    setTitle('');
    setMessage('');
    setType('info');
    setSending(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcast Message</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1">Title</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g., Maintenance notice" />
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">Type</div>
          <Select value={type} onValueChange={(v) => setType(v as BroadcastType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">Message</div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={1000} placeholder="Write your message to everyone…" />
          <div className="text-xs text-muted-foreground mt-1">{message.length}/1000</div>
        </div>

        <div className="flex justify-end">
          <Button onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send Broadcast'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

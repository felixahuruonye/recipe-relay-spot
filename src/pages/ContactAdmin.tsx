import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Send, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ContactAdmin = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const reasons = [
    { value: 'account', label: 'Account Issue' },
    { value: 'withdrawal', label: 'Withdrawal Problem' },
    { value: 'vip', label: 'VIP Subscription' },
    { value: 'report', label: 'Report User/Content' },
    { value: 'bug', label: 'Bug Report' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'payment', label: 'Payment Issue' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: 'Error', description: 'Please login first.', variant: 'destructive' });
      return;
    }

    if (!reason || !message.trim()) {
      toast({ title: 'Missing Info', description: 'Please select a reason and write your message.', variant: 'destructive' });
      return;
    }

    setSending(true);

    const { error } = await supabase.from('admin_questions').insert({
      user_id: user.id,
      user_uuid: user.id,
      user_email: user.email || '',
      question: `[${reason.toUpperCase()}] ${message.trim()}`,
      status: 'pending'
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSending(false);
      return;
    }

    toast({ 
      title: 'Message Sent!', 
      description: 'Admin will respond to you soon. Check your notifications.' 
    });

    setReason('');
    setMessage('');
    setSending(false);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Contact Admin</h1>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Send a Message to Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Reason for Contact</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Your Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or question in detail..."
              rows={6}
              maxLength={1000}
            />
            <div className="text-xs text-muted-foreground mt-1 text-right">
              {message.length}/1000
            </div>
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={sending || !reason || !message.trim()}
            className="w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            {sending ? 'Sending...' : 'Send Message'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Admin will respond to your message via notifications. Make sure to check your notifications regularly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactAdmin;

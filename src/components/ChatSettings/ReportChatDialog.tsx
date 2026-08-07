import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const REASONS = [
  'Spam or scam',
  'Harassment or bullying',
  'Hate speech',
  'Nudity or sexual content',
  'Violence or threats',
  'Impersonation',
  'Something else',
];

export const ReportChatDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partnerId: string;
  partnerName?: string;
  onReported?: () => void;
}> = ({ open, onOpenChange, partnerId, partnerName, onReported }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('report_chat' as any, {
      p_partner_id: partnerId,
      p_reason: reason,
      p_details: details || null,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Report failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Report sent', description: 'Admin received this chat with its full history.' });
    onOpenChange(false);
    setDetails('');
    onReported?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report {partnerName ? `@${partnerName}` : 'this chat'}</DialogTitle>
          <DialogDescription>
            The full conversation history is attached so admins can review it.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
          {REASONS.map((r) => (
            <label key={r} className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-accent">
              <RadioGroupItem value={r} id={r} />
              <Label htmlFor={r} className="flex-1 cursor-pointer text-sm">{r}</Label>
            </label>
          ))}
        </RadioGroup>
        <Textarea placeholder="Add details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit report'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/ChatSettings/SettingsRow';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { DISAPPEARING_OPTIONS, disappearingLabel } from '@/lib/chatTheme';

export default function DisappearingMessages() {
  const nav = useNavigate();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [val, setVal] = useState('off');

  useEffect(() => {
    if (!user || !partnerId) return;
    supabase.from('chat_preferences').select('disappearing_duration').eq('user_id', user.id).eq('partner_id', partnerId).maybeSingle()
      .then(({ data }) => data?.disappearing_duration && setVal(data.disappearing_duration));
  }, [user?.id, partnerId]);

  const change = async (v: string) => {
    const prev = val;
    setVal(v);
    if (!user || !partnerId) return;
    const { error } = await supabase.rpc('set_shared_chat_pref' as any, { p_partner_id: partnerId, p_theme: null, p_disappearing: v });
    if (error) {
      setVal(prev);
      return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    }
    // system message visible to both sides
    await supabase.from('private_messages').insert({
      from_user_id: user.id,
      to_user_id: partnerId,
      message: v === 'off' ? 'Disappearing messages were turned off' : `Disappearing messages set to ${disappearingLabel(v)}`,
      is_system: true,
    } as any);
    toast({ title: 'Updated', description: `Disappearing messages: ${disappearingLabel(v)} (both sides)` });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Disappearing messages" onBack={() => nav(`/chat/${partnerId}/settings`)} />
      <RadioGroup value={val} onValueChange={change} className="p-4 space-y-3">
        {DISAPPEARING_OPTIONS.map(o => (
          <label key={o.v} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
            <RadioGroupItem value={o.v} id={o.v} />
            <Label htmlFor={o.v} className="flex-1 cursor-pointer">{o.l}</Label>
          </label>
        ))}
      </RadioGroup>
      <p className="px-4 text-xs text-muted-foreground">
        New messages in this chat disappear after the selected time. This setting applies to both people in the chat.{' '}
        <button className="text-primary underline" onClick={() => nav('/settings')}>Learn more</button>
      </p>
    </div>
  );
}

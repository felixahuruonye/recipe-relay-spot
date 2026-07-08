import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/ChatSettings/SettingsRow';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const OPTIONS = [
  { v: 'off', l: 'Off' },
  { v: 'seen', l: "Once they're seen" },
  { v: '24h', l: '24 hours' },
  { v: '7d', l: '7 days' },
];

export default function DisappearingMessages() {
  const nav = useNavigate();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { user } = useAuth();
  const [val, setVal] = useState('off');

  useEffect(() => {
    if (!user || !partnerId) return;
    supabase.from('chat_preferences').select('disappearing_duration').eq('user_id', user.id).eq('partner_id', partnerId).maybeSingle()
      .then(({ data }) => data?.disappearing_duration && setVal(data.disappearing_duration));
  }, [user?.id, partnerId]);

  const change = async (v: string) => {
    setVal(v);
    if (!user || !partnerId) return;
    await supabase.from('chat_preferences').upsert({ user_id: user.id, partner_id: partnerId, disappearing_duration: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,partner_id' });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Disappearing messages" onBack={() => nav(`/chat/${partnerId}/settings`)} />
      <RadioGroup value={val} onValueChange={change} className="p-4 space-y-3">
        {OPTIONS.map(o => (
          <label key={o.v} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
            <RadioGroupItem value={o.v} id={o.v} />
            <Label htmlFor={o.v} className="flex-1 cursor-pointer">{o.l}</Label>
          </label>
        ))}
      </RadioGroup>
      <p className="px-4 text-xs text-muted-foreground">
        Messages will disappear based on the option you pick. Both sides need to enable this for full effect.{' '}
        <button className="text-primary underline" onClick={() => nav('/settings')}>Learn more</button>
      </p>
    </div>
  );
}

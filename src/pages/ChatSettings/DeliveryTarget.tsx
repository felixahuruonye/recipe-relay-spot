import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/ChatSettings/SettingsRow';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const LABELS: Record<string, string> = {
  friends_of_friends: 'Friends of friends on Lenory Social',
  group_members: 'People in your Lenory Social groups',
  page_followers: 'Pages that you follow',
  others: 'Others on Lenory Social',
};

const OPTIONS = [
  { v: 'chats', l: 'Chats' },
  { v: 'requests', l: 'Message requests' },
  { v: 'none', l: "Don't receive requests" },
];

export default function DeliveryTarget() {
  const nav = useNavigate();
  const { target } = useParams<{ target: string }>();
  const { user } = useAuth();
  const [val, setVal] = useState('chats');

  useEffect(() => {
    if (!user || !target) return;
    supabase.from('message_delivery_prefs').select(target).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => data && (data as any)[target] && setVal((data as any)[target]));
  }, [user?.id, target]);

  const change = async (v: string) => {
    setVal(v);
    if (!user || !target) return;
    await supabase.from('message_delivery_prefs').upsert({ user_id: user.id, [target]: v, updated_at: new Date().toISOString() });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title={LABELS[target || ''] || 'Delivery target'} onBack={() => nav('/chat/settings/delivery')} />
      <RadioGroup value={val} onValueChange={change} className="p-4 space-y-3">
        {OPTIONS.map(o => (
          <label key={o.v} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent">
            <RadioGroupItem value={o.v} id={o.v} />
            <Label htmlFor={o.v} className="flex-1 cursor-pointer">{o.l}</Label>
          </label>
        ))}
      </RadioGroup>
      <p className="px-4 text-xs text-muted-foreground">
        This controls where matching people's messages arrive. <button className="text-primary underline" onClick={() => nav('/settings')}>see the full list of who can message you.</button>
      </p>
    </div>
  );
}

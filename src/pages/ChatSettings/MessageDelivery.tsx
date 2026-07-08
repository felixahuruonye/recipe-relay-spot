import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader, SettingsRow } from '@/components/ChatSettings/SettingsRow';

const KEYS = [
  { key: 'friends_of_friends', label: 'Friends of friends on Lenory Social' },
  { key: 'group_members', label: 'People in your Lenory Social groups' },
  { key: 'page_followers', label: 'Pages that you follow' },
  { key: 'others', label: 'Others on Lenory Social' },
] as const;

export default function MessageDelivery() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    supabase.from('message_delivery_prefs').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => data && setPrefs(data as any));
  }, [user?.id]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Message delivery" onBack={() => nav('/chat/settings/privacy')} />
      <div className="p-3 text-xs text-muted-foreground bg-muted/30 border-b">
        Choose where messages land. <button className="text-primary underline" onClick={() => nav('/settings')}>See the full list of who can message you.</button>
      </div>
      <div className="px-4 pt-4 pb-1 text-xs uppercase text-muted-foreground">Potential connections</div>
      {KEYS.slice(0,3).map(k => (
        <SettingsRow key={k.key} label={k.label} hint={prefs[k.key] || 'chats'} onClick={() => nav(`/chat/settings/delivery/${k.key}`)} />
      ))}
      <div className="px-4 pt-4 pb-1 text-xs uppercase text-muted-foreground">Other people</div>
      <SettingsRow label={KEYS[3].label} hint={prefs[KEYS[3].key] || 'requests'} onClick={() => nav(`/chat/settings/delivery/${KEYS[3].key}`)} />
    </div>
  );
}

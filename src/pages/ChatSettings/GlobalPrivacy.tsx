import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader, SettingsRow } from '@/components/ChatSettings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { Send, Ban, Eye, KeyRound } from 'lucide-react';

export default function GlobalPrivacy() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('user_messaging_settings').select('global_read_receipts').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => data && setReceipts(!!data.global_read_receipts));
  }, [user?.id]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Privacy & safety" onBack={() => nav('/chat/settings')} />
      <SettingsRow icon={<Send className="w-4 h-4" />} label="Message delivery" onClick={() => nav('/chat/settings/delivery')} />
      <SettingsRow icon={<Ban className="w-4 h-4" />} label="Blocked accounts" onClick={() => nav('/chat/settings/blocked')} />
      <SettingsRow icon={<Eye className="w-4 h-4" />} label="Read receipts" hint={receipts ? 'On for all chats' : 'Off'}
        right={<Switch checked={receipts} onCheckedChange={async (v) => {
          setReceipts(v);
          if (user) await supabase.from('user_messaging_settings').upsert({ user_id: user.id, global_read_receipts: v, updated_at: new Date().toISOString() });
        }} />} />
      <div className="mt-6 px-4">
        <div className="text-xs uppercase text-muted-foreground mb-2">Encrypted chats</div>
        <SettingsRow icon={<KeyRound className="w-4 h-4" />} label="Security credentials" hint="Coming soon" />
        <SettingsRow icon={<KeyRound className="w-4 h-4" />} label="Message retention" hint="Coming soon" />
        <SettingsRow icon={<KeyRound className="w-4 h-4" />} label="Key verification" hint="Coming soon" />
      </div>
    </div>
  );
}

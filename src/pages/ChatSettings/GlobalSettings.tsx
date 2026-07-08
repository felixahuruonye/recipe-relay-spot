import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsRow, SettingsHeader } from '@/components/ChatSettings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { Activity, Bell, Inbox, Archive, ShieldCheck } from 'lucide-react';

export default function GlobalSettings() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [active, setActive] = useState(true);
  const [notif, setNotif] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('user_messaging_settings').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setActive(!!data.active_status_visible); setNotif(!!data.notifications_enabled); }
      });
  }, [user?.id]);

  const upsert = async (patch: Record<string, any>) => {
    if (!user) return;
    await supabase.from('user_messaging_settings').upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Messaging settings" onBack={() => nav('/chat')} />
      <SettingsRow icon={<Activity className="w-4 h-4" />} label="Active status" hint={active ? 'Visible to others' : 'Hidden'}
        right={<Switch checked={active} onCheckedChange={(v) => { setActive(v); upsert({ active_status_visible: v }); }} />} />
      <SettingsRow icon={<Bell className="w-4 h-4" />} label="Messaging notifications" hint={notif ? 'Enabled' : 'Muted'}
        right={<Switch checked={notif} onCheckedChange={(v) => { setNotif(v); upsert({ notifications_enabled: v }); }} />} />
      <SettingsRow icon={<Inbox className="w-4 h-4" />} label="Message requests" onClick={() => nav('/chat/settings/requests')} />
      <SettingsRow icon={<Archive className="w-4 h-4" />} label="Archive" hint="View archived conversations" onClick={() => nav('/chat?filter=archived')} />
      <SettingsRow icon={<ShieldCheck className="w-4 h-4" />} label="Privacy & safety" onClick={() => nav('/chat/settings/privacy')} />
    </div>
  );
}

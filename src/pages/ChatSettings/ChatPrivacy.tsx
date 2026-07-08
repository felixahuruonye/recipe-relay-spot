import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader, SettingsRow } from '@/components/ChatSettings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { Info, Eye, PencilLine, Ban, ShieldAlert, Flag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ChatPrivacy() {
  const nav = useNavigate();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>({ read_receipts_enabled: true, typing_indicator_enabled: true });

  useEffect(() => {
    if (!partnerId) return;
    supabase.from('user_profiles').select('id,username,created_at').eq('id', partnerId).maybeSingle().then(({ data }) => setPartner(data));
    if (user) supabase.from('chat_preferences').select('*').eq('user_id', user.id).eq('partner_id', partnerId).maybeSingle()
      .then(({ data }) => data && setPrefs(data));
  }, [partnerId, user?.id]);

  const upsert = async (patch: any) => {
    if (!user || !partnerId) return;
    setPrefs((p: any) => ({ ...p, ...patch }));
    await supabase.from('chat_preferences').upsert({ user_id: user.id, partner_id: partnerId, ...prefs, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id,partner_id' });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Privacy & safety" subtitle={`@${partner?.username || ''}`} onBack={() => nav(`/chat/${partnerId}/settings`)} />
      <SettingsRow icon={<Info className="w-4 h-4" />} label="About this account" hint={partner?.created_at ? `Joined ${new Date(partner.created_at).toLocaleDateString()}` : ''} onClick={() => nav(`/profile/${partnerId}`)} />
      <SettingsRow icon={<Eye className="w-4 h-4" />} label="Read receipts" right={<Switch checked={!!prefs.read_receipts_enabled} onCheckedChange={(v) => upsert({ read_receipts_enabled: v })} />} />
      <SettingsRow icon={<PencilLine className="w-4 h-4" />} label="Typing indicator" right={<Switch checked={!!prefs.typing_indicator_enabled} onCheckedChange={(v) => upsert({ typing_indicator_enabled: v })} />} />
      <div className="mt-6">
        <SettingsRow icon={<Ban className="w-4 h-4" />} label="Block" onClick={async () => {
          if (!user || !partnerId) return;
          await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: partnerId });
          toast({ title: 'Blocked' }); nav('/chat');
        }} />
        <SettingsRow icon={<ShieldAlert className="w-4 h-4" />} label="Restrict" onClick={() => upsert({ is_restricted: true })} />
        <SettingsRow icon={<Flag className="w-4 h-4" />} label="Report" danger onClick={() => nav('/contact-admin', { state: { reportUserId: partnerId } })} />
      </div>
    </div>
  );
}

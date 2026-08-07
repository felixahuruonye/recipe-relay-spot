import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader, SettingsRow } from '@/components/ChatSettings/SettingsRow';
import { Switch } from '@/components/ui/switch';
import { Info, Eye, PencilLine, Ban, ShieldAlert, Flag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ReportChatDialog } from '@/components/ChatSettings/ReportChatDialog';

export default function ChatPrivacy() {
  const nav = useNavigate();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>({ read_receipts_enabled: true, typing_indicator_enabled: true });
  const [reportOpen, setReportOpen] = useState(false);

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

  const restrictedUntil = prefs.restricted_until && new Date(prefs.restricted_until) > new Date() ? prefs.restricted_until : null;

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Privacy & safety" subtitle={`@${partner?.username || ''}`} onBack={() => nav(`/chat/${partnerId}/settings`)} />
      <SettingsRow icon={<Info className="w-4 h-4" />} label="About this account" hint={partner?.created_at ? `Joined ${new Date(partner.created_at).toLocaleDateString()}` : ''} onClick={() => nav(`/profile/${partnerId}`)} />
      <SettingsRow icon={<Eye className="w-4 h-4" />} label="Read receipts" hint={prefs.read_receipts_enabled === false ? 'Off for this chat' : 'On for this chat'} right={<Switch checked={prefs.read_receipts_enabled !== false} onCheckedChange={(v) => upsert({ read_receipts_enabled: v })} />} />
      <SettingsRow icon={<PencilLine className="w-4 h-4" />} label="Typing indicator" hint={prefs.typing_indicator_enabled === false ? 'Hidden' : 'Visible'} right={<Switch checked={prefs.typing_indicator_enabled !== false} onCheckedChange={(v) => upsert({ typing_indicator_enabled: v })} />} />
      <div className="mt-6">
        <SettingsRow icon={<Ban className="w-4 h-4" />} label="Block" onClick={async () => {
          if (!user || !partnerId) return;
          const { error } = await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: partnerId });
          if (error && !error.message.includes('duplicate')) return toast({ title: 'Block failed', description: error.message, variant: 'destructive' });
          toast({ title: 'Blocked' }); nav('/chat');
        }} />
        <SettingsRow icon={<ShieldAlert className="w-4 h-4" />} label="Restrict for 14 days"
          hint={restrictedUntil ? `Until ${new Date(restrictedUntil).toLocaleDateString()}` : undefined}
          onClick={async () => {
            const { error } = await supabase.rpc('restrict_chat' as any, { p_partner_id: partnerId, p_days: 14 });
            if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
            setPrefs((p: any) => ({ ...p, is_restricted: true, restricted_until: new Date(Date.now() + 14 * 86400000).toISOString() }));
            toast({ title: 'Restricted for 14 days' });
          }} />
        <SettingsRow icon={<Flag className="w-4 h-4" />} label="Report" danger onClick={() => setReportOpen(true)} />
      </div>
      <ReportChatDialog open={reportOpen} onOpenChange={setReportOpen} partnerId={partnerId!} partnerName={partner?.username} />
    </div>
  );
}

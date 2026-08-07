import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader, SettingsRow } from '@/components/ChatSettings/SettingsRow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { User, Search, BellOff, MoreHorizontal, Palette, Clock, ShieldCheck, Users } from 'lucide-react';
import { CHAT_THEMES, getChatTheme, disappearingLabel } from '@/lib/chatTheme';
import { ReportChatDialog } from '@/components/ChatSettings/ReportChatDialog';

export default function ChatProfile() {
  const nav = useNavigate();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>({ theme_key: 'Default', disappearing_duration: 'off' });
  const [themeOpen, setThemeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const loadPrefs = async () => {
    if (!user || !partnerId) return;
    const { data } = await supabase.from('chat_preferences').select('*')
      .eq('user_id', user.id).eq('partner_id', partnerId).maybeSingle();
    if (data) setPrefs(data);
  };

  useEffect(() => {
    if (!partnerId) return;
    supabase.from('user_profiles').select('id,username,avatar_url,bio').eq('id', partnerId).maybeSingle()
      .then(({ data }) => setPartner(data));
    loadPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, user?.id]);

  // live-sync when the other person changes the shared theme
  useEffect(() => {
    if (!user || !partnerId) return;
    const ch = supabase.channel(`chat-prefs-${user.id}-${partnerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_preferences', filter: `user_id=eq.${user.id}` }, (payload) => {
        const row = payload.new as any;
        if (row?.partner_id === partnerId) setPrefs((p: any) => ({ ...p, ...row }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, partnerId]);

  const upsert = async (patch: any) => {
    if (!user || !partnerId) return;
    setPrefs((p: any) => ({ ...p, ...patch }));
    await supabase.from('chat_preferences').upsert(
      { user_id: user.id, partner_id: partnerId, ...prefs, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,partner_id' }
    );
  };

  const mute = async (hours: number, label: string) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    await upsert({ muted_until: until });
    toast({ title: `Muted for ${label}`, description: `Notifications resume ${new Date(until).toLocaleString()}` });
  };

  const block = async () => {
    if (!user || !partnerId) return;
    const { error } = await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: partnerId });
    if (error && !error.message.includes('duplicate')) {
      return toast({ title: 'Block failed', description: error.message, variant: 'destructive' });
    }
    toast({ title: 'Blocked', description: 'They can no longer message you and their profile photo is hidden.' });
    nav('/chat');
  };

  const restrict = async () => {
    if (!partnerId) return;
    const { error } = await supabase.rpc('restrict_chat' as any, { p_partner_id: partnerId, p_days: 14 });
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Restricted for 14 days' });
    loadPrefs();
  };

  const pickTheme = async (t: string) => {
    if (!partnerId) return;
    setPrefs((p: any) => ({ ...p, theme_key: t }));
    setThemeOpen(false);
    const { error } = await supabase.rpc('set_shared_chat_pref' as any, { p_partner_id: partnerId, p_theme: t, p_disappearing: null });
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: `Theme: ${t}`, description: 'Applied to both sides of this chat.' });
  };

  const restrictedUntil = prefs.restricted_until && new Date(prefs.restricted_until) > new Date() ? prefs.restricted_until : null;
  const mutedUntil = prefs.muted_until && new Date(prefs.muted_until) > new Date() ? prefs.muted_until : null;

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="" onBack={() => nav(-1 as any)} />
      <div className="flex flex-col items-center py-6 border-b">
        <Avatar className="w-20 h-20"><AvatarImage src={partner?.avatar_url || ''} /><AvatarFallback>{partner?.username?.[0]?.toUpperCase() || '?'}</AvatarFallback></Avatar>
        <div className="mt-3 text-lg font-semibold">{partner?.username || '…'}</div>
        {restrictedUntil && (
          <div className="mt-1 text-xs text-amber-500">Restricted until {new Date(restrictedUntil).toLocaleDateString()}</div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 p-4 border-b">
        <Button variant="outline" className="flex-col h-auto py-3" onClick={() => nav(`/profile/${partnerId}`)}><User className="w-4 h-4" /><span className="text-xs mt-1">Profile</span></Button>
        <Button variant="outline" className="flex-col h-auto py-3" onClick={() => nav('/chat', { state: { recipientId: partnerId, focusSearch: true } })}><Search className="w-4 h-4" /><span className="text-xs mt-1">Search</span></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-col h-auto py-3"><BellOff className="w-4 h-4" /><span className="text-xs mt-1">Mute</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => mute(1, '1 hour')}>1 hour</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(8, '8 hours')}>8 hours</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(24, '24 hours')}>24 hours</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(24 * 7, '1 week')}>1 week</DropdownMenuItem>
            {mutedUntil && <DropdownMenuItem onClick={() => upsert({ muted_until: null })}>Unmute</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-col h-auto py-3"><MoreHorizontal className="w-4 h-4" /><span className="text-xs mt-1">Options</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={restrict}>Restrict for 14 days</DropdownMenuItem>
            <DropdownMenuItem onClick={block}>Block</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setReportOpen(true)} className="text-destructive">Report</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SettingsRow icon={<Palette className="w-4 h-4" />} label="Theme" hint={prefs.theme_key || 'Default'} onClick={() => setThemeOpen(true)} />
      <SettingsRow icon={<Clock className="w-4 h-4" />} label="Disappearing messages" hint={disappearingLabel(prefs.disappearing_duration)} onClick={() => nav(`/chat/${partnerId}/settings/disappearing`)} />
      <SettingsRow icon={<ShieldCheck className="w-4 h-4" />} label="Privacy & safety" onClick={() => nav(`/chat/${partnerId}/settings/privacy`)} />
      <SettingsRow icon={<Users className="w-4 h-4" />} label="Create a group chat" onClick={() => nav('/groups', { state: { preselect: [partnerId] } })} />

      <ReportChatDialog open={reportOpen} onOpenChange={setReportOpen} partnerId={partnerId!} partnerName={partner?.username} />

      <Sheet open={themeOpen} onOpenChange={setThemeOpen}>
        <SheetContent side="bottom" className="h-[70dvh]">
          <SheetHeader><SheetTitle>Theme (shared with @{partner?.username || 'them'})</SheetTitle></SheetHeader>
          <div className="grid grid-cols-3 gap-3 mt-4 overflow-y-auto pb-8">
            {CHAT_THEMES.map(t => (
              <button key={t.key} onClick={() => pickTheme(t.key)} className={`rounded-xl border p-3 aspect-[3/4] flex flex-col justify-end text-left hover:border-primary transition ${prefs.theme_key === t.key ? 'border-primary bg-primary/10' : ''}`}>
                <div className="flex-1 rounded-lg mb-2" style={{ background: getChatTheme(t.key).mine }} />
                <div className="text-xs font-medium leading-tight">{t.key}</div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

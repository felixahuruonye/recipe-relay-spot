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

const THEMES = ['Default','Supergirl','Avatar: The Last Airbender','Olivia Rodrigo','Backrooms','Deli Boys','Maluma','The Mandalorian & Grogu','The Devil Wears Prada 2','Pixel Dreamscape'];

export default function ChatProfile() {
  const nav = useNavigate();
  const { partnerId } = useParams<{ partnerId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [partner, setPartner] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>({ theme_key: 'Default', disappearing_duration: 'off' });
  const [themeOpen, setThemeOpen] = useState(false);

  useEffect(() => {
    if (!partnerId) return;
    supabase.from('user_profiles').select('id,username,avatar_url,bio').eq('id', partnerId).maybeSingle()
      .then(({ data }) => setPartner(data));
    if (user) supabase.from('chat_preferences').select('*').eq('user_id', user.id).eq('partner_id', partnerId).maybeSingle()
      .then(({ data }) => data && setPrefs(data));
  }, [partnerId, user?.id]);

  const upsert = async (patch: any) => {
    if (!user || !partnerId) return;
    setPrefs((p: any) => ({ ...p, ...patch }));
    await supabase.from('chat_preferences').upsert({ user_id: user.id, partner_id: partnerId, ...prefs, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id,partner_id' });
  };

  const mute = async (hours: number) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    await upsert({ muted_until: until });
    toast({ title: `Muted for ${hours}h` });
  };

  const block = async () => {
    if (!user || !partnerId) return;
    await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: partnerId });
    toast({ title: 'Blocked' });
    nav('/chat');
  };

  const restrict = async () => { await upsert({ is_restricted: true }); toast({ title: 'Restricted' }); };

  const pickTheme = async (t: string) => {
    await upsert({ theme_key: t });
    setThemeOpen(false);
    document.documentElement.style.setProperty('--chat-theme', t);
    toast({ title: `Theme: ${t}` });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="" onBack={() => nav(-1 as any)} />
      <div className="flex flex-col items-center py-6 border-b">
        <Avatar className="w-20 h-20"><AvatarImage src={partner?.avatar_url || ''} /><AvatarFallback>{partner?.username?.[0]?.toUpperCase() || '?'}</AvatarFallback></Avatar>
        <div className="mt-3 text-lg font-semibold">{partner?.username || '…'}</div>
      </div>
      <div className="grid grid-cols-4 gap-2 p-4 border-b">
        <Button variant="outline" className="flex-col h-auto py-3" onClick={() => nav(`/profile/${partnerId}`)}><User className="w-4 h-4" /><span className="text-xs mt-1">Profile</span></Button>
        <Button variant="outline" className="flex-col h-auto py-3" onClick={() => nav('/chat', { state: { recipientId: partnerId, focusSearch: true } })}><Search className="w-4 h-4" /><span className="text-xs mt-1">Search</span></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-col h-auto py-3"><BellOff className="w-4 h-4" /><span className="text-xs mt-1">Mute</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => mute(1)}>1 hour</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(8)}>8 hours</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(24)}>24 hours</DropdownMenuItem>
            <DropdownMenuItem onClick={() => mute(24*7)}>1 week</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex-col h-auto py-3"><MoreHorizontal className="w-4 h-4" /><span className="text-xs mt-1">Options</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={restrict}>Restrict</DropdownMenuItem>
            <DropdownMenuItem onClick={block}>Block</DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/contact-admin', { state: { reportUserId: partnerId } })} className="text-destructive">Report</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SettingsRow icon={<Palette className="w-4 h-4" />} label="Theme" hint={prefs.theme_key || 'Default'} onClick={() => setThemeOpen(true)} />
      <SettingsRow icon={<Clock className="w-4 h-4" />} label="Disappearing messages" hint={prefs.disappearing_duration || 'off'} onClick={() => nav(`/chat/${partnerId}/settings/disappearing`)} />
      <SettingsRow icon={<ShieldCheck className="w-4 h-4" />} label="Privacy & safety" onClick={() => nav(`/chat/${partnerId}/settings/privacy`)} />
      <SettingsRow icon={<Users className="w-4 h-4" />} label="Create a group chat" onClick={() => nav('/groups', { state: { preselect: [partnerId] } })} />

      <Sheet open={themeOpen} onOpenChange={setThemeOpen}>
        <SheetContent side="bottom" className="h-[70dvh]">
          <SheetHeader><SheetTitle>Theme</SheetTitle></SheetHeader>
          <div className="grid grid-cols-3 gap-3 mt-4 overflow-y-auto pb-8">
            {THEMES.map(t => (
              <button key={t} onClick={() => pickTheme(t)} className={`rounded-xl border p-3 aspect-[3/4] flex flex-col justify-end text-left hover:border-primary transition ${prefs.theme_key === t ? 'border-primary bg-primary/10' : ''}`}>
                <div className="flex-1 rounded-lg mb-2" style={{ background: `linear-gradient(135deg, hsl(${(t.length*37)%360} 70% 55%), hsl(${(t.length*67)%360} 65% 45%))` }} />
                <div className="text-xs font-medium leading-tight">{t}</div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/ChatSettings/SettingsRow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Row = { id: string; blocked_id: string; created_at: string; reason: string | null; username?: string; avatar_url?: string | null };

export default function BlockedAccounts() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('blocked_users').select('*').eq('blocker_id', user.id).order('created_at', { ascending: false });
    const rows = (data as any[]) || [];
    if (rows.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id,username,avatar_url').in('id', rows.map(r => r.blocked_id));
      rows.forEach(r => { const p = profs?.find((x: any) => x.id === r.blocked_id); r.username = p?.username; r.avatar_url = p?.avatar_url; });
    }
    setRows(rows);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('user_profiles').select('id,username,avatar_url').ilike('username', `%${q}%`).limit(10);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const block = async (target: any) => {
    if (!user) return;
    const { error } = await supabase.from('blocked_users').insert({ blocker_id: user.id, blocked_id: target.id });
    if (error) return toast({ title: 'Block failed', description: error.message, variant: 'destructive' });
    toast({ title: `Blocked @${target.username}` });
    setShowSearch(false); setQ(''); setResults([]);
    load();
  };

  const unblock = async (id: string) => {
    await supabase.from('blocked_users').delete().eq('id', id);
    toast({ title: 'Unblocked' });
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Blocked accounts" onBack={() => nav('/chat/settings/privacy')}
        right={<button aria-label="Add" className="p-2" onClick={() => setShowSearch(v => !v)}><Plus className="w-5 h-5" /></button>} />
      {showSearch && (
        <div className="p-3 border-b space-y-2">
          <Input placeholder="Search username to block…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {results.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-2 rounded hover:bg-accent">
              <Avatar className="w-8 h-8"><AvatarImage src={r.avatar_url || ''} /><AvatarFallback>{r.username?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
              <span className="flex-1 truncate">@{r.username}</span>
              <Button size="sm" variant="destructive" onClick={() => block(r)}>Block</Button>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No blocked accounts.</div>
        : rows.map(r => (
          <div key={r.id} className="flex items-center gap-3 p-3 border-b">
            <Avatar className="w-10 h-10"><AvatarImage src={r.avatar_url || ''} /><AvatarFallback>{r.username?.[0]?.toUpperCase() || '?'}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">@{r.username || r.blocked_id.slice(0,8)}</div>
              <div className="text-xs text-muted-foreground">Blocked on Lenory Social</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => unblock(r.id)}>Unblock</Button>
          </div>
        ))}
    </div>
  );
}

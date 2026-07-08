import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/ChatSettings/SettingsRow';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Row = { partnerId: string; last: string; at: string; username?: string; avatar_url?: string | null };

export default function MessageRequests() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [followerIds, setFollowerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: fol } = await supabase.from('followers').select('following_id').eq('follower_id', user.id);
      const known = new Set<string>((fol || []).map((f: any) => f.following_id));
      setFollowerIds(known);

      const { data: msgs } = await supabase
        .from('private_messages').select('*').eq('to_user_id', user.id)
        .order('created_at', { ascending: false }).limit(200);

      const byP: Record<string, Row> = {};
      (msgs || []).forEach((m: any) => {
        const p = m.from_user_id;
        if (!p || byP[p]) return;
        byP[p] = { partnerId: p, last: m.message || '', at: m.created_at };
      });
      const list = Object.values(byP);
      const ids = list.map(r => r.partnerId);
      if (ids.length) {
        const { data: profs } = await supabase.from('user_profiles').select('id,username,avatar_url').in('id', ids);
        (profs || []).forEach((p: any) => {
          const r = list.find(x => x.partnerId === p.id); if (r) { r.username = p.username; r.avatar_url = p.avatar_url; }
        });
      }
      setRows(list);
    };
    load();
  }, [user?.id]);

  const { requests, spam } = useMemo(() => ({
    requests: rows.filter(r => !followerIds.has(r.partnerId)),
    spam: [] as Row[],
  }), [rows, followerIds]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <SettingsHeader title="Message requests" onBack={() => nav('/chat/settings')} />
      <div className="p-3 text-sm text-muted-foreground bg-muted/30 border-b">
        <button className="text-primary underline" onClick={() => nav('/chat/settings/delivery')}>Decide who can message you</button>
      </div>
      <Tabs defaultValue="known" className="w-full">
        <TabsList className="w-full grid grid-cols-2 rounded-none">
          <TabsTrigger value="known">You may know</TabsTrigger>
          <TabsTrigger value="spam">Spam</TabsTrigger>
        </TabsList>
        <TabsContent value="known" className="p-0">
          {requests.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No message requests</div>
            : requests.map(r => (
              <button key={r.partnerId} onClick={() => nav('/chat', { state: { recipientId: r.partnerId } })}
                className="w-full flex items-center gap-3 p-3 border-b hover:bg-accent text-left">
                <Avatar className="w-10 h-10"><AvatarImage src={r.avatar_url || ''} /><AvatarFallback>{r.username?.[0]?.toUpperCase() || '?'}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.username || 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.last}</div>
                </div>
              </button>
            ))}
        </TabsContent>
        <TabsContent value="spam" className="p-0">
          {spam.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No spam</div> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

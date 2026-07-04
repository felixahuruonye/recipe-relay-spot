import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

type UserRow = {
  id: string;
  username: string;
  monetization_level: number | null;
  earning_banned: boolean | null;
  view_earn_progress: number | null;
  follower_count: number | null;
  total_earned: number | null;
};

type Setting = { setting_key: string; setting_value: string; description: string | null };

const TUNABLE_KEYS = [
  'star_to_ngn_rate','first_view_stars','split_creator_pct','split_creator_music_pct',
  'split_musician_pct','split_viewer_cashback_pct','split_platform_pct',
  'level1_followers','level1_reactions','level2_followers','level2_reactions','level3_followers','level3_reactions'
];

export const MonetizationTab: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = async () => {
    const { data: u } = await supabase
      .from('user_profiles')
      .select('id, username, monetization_level, earning_banned, view_earn_progress, follower_count, total_earned')
      .order('total_earned', { ascending: false })
      .limit(200);
    setUsers((u as any) || []);

    const { data: s } = await supabase.from('admin_settings').select('setting_key, setting_value, description').in('setting_key', TUNABLE_KEYS);
    setSettings((s as any) || []);

    const { data: f } = await (supabase as any).from('fraud_flags').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(50);
    setFlags(f || []);

    const { data: e } = await (supabase as any).from('monetization_events').select('*').order('created_at', { ascending: false }).limit(50);
    setEvents(e || []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-monetization')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fraud_flags' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monetization_events' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter(u => (u.username || '').toLowerCase().includes(q)) : users;
  }, [users, search]);

  const setLevel = async (u: UserRow, level: number) => {
    const { data, error } = await supabase.rpc('admin_set_monetization_level' as any, { p_user_id: u.id, p_level: level });
    if (error || !(data as any)?.success) return toast({ title: 'Failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
    toast({ title: `Level ${level} set`, description: u.username });
  };

  const toggleBan = async (u: UserRow) => {
    const next = !u.earning_banned;
    const reason = next ? window.prompt('Reason for banning earnings?') || '' : '';
    const { data, error } = await supabase.rpc('admin_set_earning_ban' as any, { p_user_id: u.id, p_banned: next, p_reason: reason });
    if (error || !(data as any)?.success) return toast({ title: 'Failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
    toast({ title: next ? 'Earnings banned' : 'Earnings restored', description: u.username });
  };

  const saveSetting = async (key: string) => {
    const value = edits[key];
    if (value === undefined) return;
    const { data, error } = await supabase.rpc('admin_update_setting' as any, { p_key: key, p_value: value });
    if (error || !(data as any)?.success) return toast({ title: 'Failed', description: error?.message, variant: 'destructive' });
    toast({ title: 'Updated', description: key });
    setEdits(prev => { const c = { ...prev }; delete c[key]; return c; });
  };

  const resolveFlag = async (id: string) => {
    await (supabase as any).from('fraud_flags').update({ status: 'resolved', reviewed_at: new Date().toISOString() }).eq('id', id);
    toast({ title: 'Flag resolved' });
  };

  return (
    <Tabs defaultValue="users" className="w-full">
      <TabsList>
        <TabsTrigger value="users">Creators</TabsTrigger>
        <TabsTrigger value="settings">Rates</TabsTrigger>
        <TabsTrigger value="flags">Fraud Queue {flags.length ? `(${flags.length})` : ''}</TabsTrigger>
        <TabsTrigger value="events">Ledger</TabsTrigger>
      </TabsList>

      <TabsContent value="users">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Creator Monetization</CardTitle>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username…" className="sm:max-w-xs" />
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Followers</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell><Badge variant="outline">L{u.monetization_level ?? 0}</Badge></TableCell>
                    <TableCell>{u.follower_count ?? 0}</TableCell>
                    <TableCell>{u.view_earn_progress ?? 0}</TableCell>
                    <TableCell>₦{Number(u.total_earned || 0).toFixed(0)}</TableCell>
                    <TableCell>{u.earning_banned ? <Badge variant="destructive">Banned</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {[0,1,2,3].map(l => (
                        <Button key={l} size="sm" variant={u.monetization_level === l ? 'default' : 'outline'} className="h-7 px-2" onClick={() => setLevel(u, l)}>L{l}</Button>
                      ))}
                      <Button size="sm" variant={u.earning_banned ? 'secondary' : 'destructive'} className="h-7" onClick={() => toggleBan(u)}>
                        {u.earning_banned ? 'Unban' : 'Ban'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings">
        <Card>
          <CardHeader><CardTitle>Tunable Rates</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Key</TableHead><TableHead>Value</TableHead><TableHead>New value</TableHead><TableHead className="text-right">Save</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {settings.map(s => (
                  <TableRow key={s.setting_key}>
                    <TableCell>
                      <div className="font-mono text-xs">{s.setting_key}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </TableCell>
                    <TableCell className="font-mono">{s.setting_value}</TableCell>
                    <TableCell>
                      <Input value={edits[s.setting_key] ?? ''} onChange={(e) => setEdits(prev => ({ ...prev, [s.setting_key]: e.target.value }))} placeholder={s.setting_value} className="h-8 w-32" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={edits[s.setting_key] === undefined} onClick={() => saveSetting(s.setting_key)}>Save</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="flags">
        <Card>
          <CardHeader><CardTitle>Open Fraud Flags</CardTitle></CardHeader>
          <CardContent>
            {flags.length === 0 ? <p className="text-sm text-muted-foreground">No open flags.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Details</TableHead><TableHead>When</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {flags.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.user_id.slice(0,8)}</TableCell>
                      <TableCell>{f.flag_type}</TableCell>
                      <TableCell><Badge variant={f.severity === 'high' ? 'destructive' : 'secondary'}>{f.severity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs max-w-[240px] truncate">{JSON.stringify(f.details)}</TableCell>
                      <TableCell className="text-xs">{new Date(f.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => resolveFlag(f.id)}>Resolve</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="events">
        <Card>
          <CardHeader><CardTitle>Recent Monetization Events</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Stars</TableHead><TableHead>Gross</TableHead><TableHead>Creator</TableHead><TableHead>Viewer CB</TableHead><TableHead>Platform</TableHead><TableHead>When</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell><Badge variant="outline">{e.event_type}</Badge></TableCell>
                    <TableCell>{e.stars_spent}</TableCell>
                    <TableCell>₦{Number(e.ngn_gross).toFixed(0)}</TableCell>
                    <TableCell>₦{Number(e.creator_amount).toFixed(0)}</TableCell>
                    <TableCell>₦{Number(e.viewer_cashback).toFixed(0)}</TableCell>
                    <TableCell>₦{Number(e.platform_amount).toFixed(0)}</TableCell>
                    <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default MonetizationTab;

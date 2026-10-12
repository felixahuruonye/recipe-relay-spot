import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw } from 'lucide-react';

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
  'star_to_ngn_rate',
  'split_creator_pct',
  'split_creator_music_pct',
  'split_musician_pct',
  'split_viewer_cashback_pct',
  'split_platform_pct',
];

export const MonetizationTab: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tipLedger, setTipLedger] = useState<any[]>([]);
  const [tipLoadError, setTipLoadError] = useState<string | null>(null);
  const [vaultRefreshing, setVaultRefreshing] = useState(false);
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
    // Primary: tip_ledger. Fallback: reconstruct from wallet_history tip rows
    // (ledger inserts can fail if the apply_tip_ledger trigger errors).
    const tipsRes = await (supabase as any)
      .from('tip_ledger')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!tipsRes.error && tipsRes.data && tipsRes.data.length > 0) {
      setTipLoadError(null);
      setTipLedger(tipsRes.data);
    } else {
      if (tipsRes.error) {
        console.warn('tip_ledger admin load', tipsRes.error);
        setTipLoadError(tipsRes.error.message || 'Cannot read tip_ledger');
      } else {
        setTipLoadError(null);
      }

      // Fallback from wallet_history so vault is never empty when tips exist
      const histRes = await (supabase as any)
        .from('wallet_history')
        .select('*')
        .in('type', ['tip_cashback', 'tip_earn', 'tip', 'TIP', 'tip_cashback'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (histRes.error) {
        console.warn('wallet_history vault fallback', histRes.error);
        if (!tipsRes.error) setTipLoadError('tip_ledger empty — also failed reading wallet_history: ' + histRes.error.message);
        setTipLedger([]);
      } else {
        const rows = (histRes.data || []).map((h: any) => {
          const meta = h.meta || {};
          const amount = Number(h.amount || 0);
          const isCashback = String(h.type || '').toLowerCase().includes('cashback');
          const stars = Number(meta.stars || 0);
          return {
            id: h.id,
            post_id: meta.post_id || null,
            from_user_id: isCashback ? h.user_id : (meta.from_user_id || null),
            to_user_id: isCashback ? (meta.creator_id || null) : h.user_id,
            stars,
            star_to_ngn_rate: meta.rate || null,
            amount_ngn: amount,
            creator_pct: null,
            musician_pct: null,
            viewer_pct: null,
            platform_pct: null,
            creator_ngn: isCashback ? 0 : amount,
            musician_ngn: 0,
            viewer_ngn: isCashback ? amount : 0,
            platform_ngn: 0,
            source: meta.source || h.type || 'tip',
            music_track_id: null,
            created_at: h.created_at,
            _from_wallet_history: true,
          };
        });
        setTipLedger(rows);
        if (rows.length === 0 && !tipsRes.error) {
          setTipLoadError('tip_ledger is empty. New tips should write here — if wallet shows tips but vault does not, the tip_ledger trigger may be blocking inserts. Run the trigger fix SQL.');
        }
      }
    }
  };

  const refreshVault = async () => {
    setVaultRefreshing(true);
    await load();
    setVaultRefreshing(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-monetization')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fraud_flags' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monetization_events' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_ledger' }, load)
      .subscribe();
    // Auto-refresh tip vault + rates every 3s
    const poll = setInterval(() => { load(); }, 3000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
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
        <TabsTrigger value="vault">Tip Vault</TabsTrigger>
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
    
      <TabsContent value="vault">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Tip Vault — full history</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Every tip split (creator + platform + viewer + musician). Auto-refreshes every 3s.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => refreshVault()} disabled={vaultRefreshing} className="gap-2 shrink-0">
              <RefreshCw className={`w-4 h-4 ${vaultRefreshing ? 'animate-spin' : ''}`} />
              {vaultRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto space-y-3">
            {tipLoadError && (
              <p className="text-sm text-amber-600 bg-amber-500/10 rounded-md p-3">
                Tip Vault could not load: {tipLoadError}. Run the tip_ledger SELECT policy SQL.
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Total tips</p>
                <p className="font-bold text-lg">{tipLedger.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Stars tipped</p>
                <p className="font-bold text-lg">{tipLedger.reduce((a, t) => a + Number(t.stars || 0), 0)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Creator ₦</p>
                <p className="font-bold text-lg">₦{tipLedger.reduce((a, t) => a + Number(t.creator_ngn || 0), 0).toFixed(0)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Platform ₦</p>
                <p className="font-bold text-lg">₦{tipLedger.reduce((a, t) => a + Number(t.platform_ngn || 0), 0).toFixed(0)}</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Stars</TableHead>
                  <TableHead>Creator ₦</TableHead>
                  <TableHead>Platform ₦</TableHead>
                  <TableHead>Viewer ₦</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipLedger.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground text-sm">No tips yet. Run the tip_ledger migration and tip a post.</TableCell></TableRow>
                )}
                {tipLedger.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</TableCell>
                    <TableCell>{t.stars}</TableCell>
                    <TableCell>₦{Number(t.creator_ngn || 0).toFixed(0)}</TableCell>
                    <TableCell>₦{Number(t.platform_ngn || 0).toFixed(0)}</TableCell>
                    <TableCell>₦{Number(t.viewer_ngn || 0).toFixed(0)}</TableCell>
                    <TableCell><Badge variant="outline">{t.source}</Badge></TableCell>
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

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Search, Eye, X } from 'lucide-react';

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
      // Pull recent wallet rows and keep tip-related ones (type names vary)
      const histRes = await (supabase as any)
        .from('wallet_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (histRes.error) {
        console.warn('wallet_history vault fallback', histRes.error);
        if (!tipsRes.error) setTipLoadError('tip_ledger empty — also failed reading wallet_history: ' + histRes.error.message);
        setTipLedger([]);
      } else {
        const tipLike = (histRes.data || []).filter((h: any) => {
          const t = String(h.type || '').toLowerCase();
          return t.includes('tip') || t.includes('cashback');
        });
        const rows = tipLike.map((h: any) => {
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

  const vaultRange = useMemo(() => {
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = now;
    if (vaultPeriod === 'custom') {
      from = vaultFrom ? new Date(vaultFrom) : null;
      to = vaultTo ? new Date(vaultTo + 'T23:59:59') : now;
    } else {
      const days = parseInt(vaultPeriod, 10) || 30;
      from = new Date(now.getTime() - days * 86400000);
    }
    return { from, to };
  }, [vaultPeriod, vaultFrom, vaultTo]);

  const periodLedger = useMemo(() => {
    const { from, to } = vaultRange;
    return (tipLedger || []).filter((t: any) => {
      const d = new Date(t.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [tipLedger, vaultRange]);

  const vaultStats = useMemo(() => {
    let totalTips = 0;
    let starsTipped = 0;
    let creatorNgn = 0;
    let viewerNgn = 0;
    let musicianNgn = 0;
    let platformNgn = 0;
    // Prefer real tip_ledger rows (have platform_ngn etc.)
    const real = periodLedger.filter((t: any) => !t._from_wallet_history);
    const source = real.length > 0 ? real : periodLedger;
    totalTips = source.length;
    source.forEach((t: any) => {
      starsTipped += Number(t.stars || 0);
      creatorNgn += Number(t.creator_ngn || 0);
      viewerNgn += Number(t.viewer_ngn || 0);
      musicianNgn += Number(t.musician_ngn || 0);
      let p = Number(t.platform_ngn || 0);
      if (p === 0 && t.amount_ngn && t.platform_pct) {
        p = Number(t.amount_ngn) * Number(t.platform_pct) / 100;
      }
      // If still 0, estimate from stars * rate * platform split from settings
      if (p === 0 && t.stars) {
        const rate = Number(t.star_to_ngn_rate) || Number(settings.find(s => s.setting_key === 'star_to_ngn_rate')?.setting_value) || 300;
        const pct = Number(settings.find(s => s.setting_key === 'split_platform_pct')?.setting_value) || 25;
        p = Number(t.stars) * rate * pct / 100;
      }
      platformNgn += p;
    });
    return { totalTips, starsTipped, creatorNgn, viewerNgn, musicianNgn, platformNgn };
  }, [periodLedger, settings]);

  const vaultUsers = useMemo(() => {
    const q = vaultUserSearch.trim().toLowerCase();
    let list = users;
    if (q) list = list.filter(u => (u.username || '').toLowerCase().includes(q));
    return list.slice(0, 100);
  }, [users, vaultUserSearch]);

  const userTipRows = useMemo(() => {
    if (!selectedVaultUser) return [] as any[];
    const uid = selectedVaultUser.id;
    return periodLedger.filter((t: any) => t.from_user_id === uid || t.to_user_id === uid);
  }, [selectedVaultUser, periodLedger]);


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
        <TabsTrigger value="vault">Earning Vault</TabsTrigger>
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
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Earning Vault</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Platform tip & cashback economics. Totals follow the selected time period.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => refreshVault()} disabled={vaultRefreshing} className="gap-2 shrink-0">
                <RefreshCw className={`w-4 h-4 ${vaultRefreshing ? 'animate-spin' : ''}`} />
                {vaultRefreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {(['7d','14d','28d','30d','60d','90d','custom'] as const).map((p) => (
                <Button key={p} type="button" size="sm" variant={vaultPeriod === p ? 'default' : 'outline'} className="h-8"
                  onClick={() => setVaultPeriod(p)}>
                  {p === 'custom' ? 'Custom' : p}
                </Button>
              ))}
              {vaultPeriod === 'custom' && (
                <div className="flex gap-2 items-center">
                  <Input type="date" className="h-8 w-auto" value={vaultFrom} onChange={(e) => setVaultFrom(e.target.value)} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="date" className="h-8 w-auto" value={vaultTo} onChange={(e) => setVaultTo(e.target.value)} />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto space-y-4">
            {tipLoadError && (
              <p className="text-sm text-amber-600 bg-amber-500/10 rounded-md p-3">{tipLoadError}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Total tips</p>
                <p className="font-bold text-lg">{vaultStats.totalTips}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Stars tipped</p>
                <p className="font-bold text-lg">{vaultStats.starsTipped}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Creators ₦</p>
                <p className="font-bold text-lg text-green-500">₦{vaultStats.creatorNgn.toFixed(0)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Viewers ₦</p>
                <p className="font-bold text-lg text-sky-500">₦{vaultStats.viewerNgn.toFixed(0)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Musicians ₦</p>
                <p className="font-bold text-lg text-violet-500">₦{vaultStats.musicianNgn.toFixed(0)}</p>
              </div>
              <button type="button" onClick={() => { setSelectedVaultUser(null); setDetailKind('platform'); }}
                className="rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors">
                <p className="text-muted-foreground text-xs">Platform ₦ · tap history</p>
                <p className="font-bold text-lg text-amber-500">₦{vaultStats.platformNgn.toFixed(0)}</p>
              </button>
            </div>

            {/* User picker */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Users</p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search username…" value={vaultUserSearch}
                  onChange={(e) => setVaultUserSearch(e.target.value)} />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {vaultUsers.map((u) => (
                  <button key={u.id} type="button"
                    onClick={() => { setSelectedVaultUser(u); setDetailKind(null); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted/40 ${selectedVaultUser?.id === u.id ? 'bg-muted' : ''}`}>
                    <span className="font-medium">@{u.username || u.id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[10px]">🟣 Not Verified</Badge>
                  </button>
                ))}
                {vaultUsers.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No users match.</p>
                )}
              </div>
            </div>

            {/* Selected user history table */}
            {selectedVaultUser && (
              <div className="space-y-2 border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">History · @{selectedVaultUser.username}</p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedVaultUser(null)}><X className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-purple-600">🟣 Not Verified</Badge>
                  <span className="text-muted-foreground">Earning status default until monetization program is live</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Star spent</TableHead>
                      <TableHead>Star received</TableHead>
                      <TableHead>Cashbacks</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userTipRows.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-muted-foreground text-sm">No tip activity for this user in the selected period.</TableCell></TableRow>
                    )}
                    {userTipRows.map((t: any) => {
                      const spent = t.from_user_id === selectedVaultUser.id ? Number(t.stars || 0) : 0;
                      const cash = t.from_user_id === selectedVaultUser.id ? Number(t.viewer_ngn || 0) : 0;
                      const recv = t.to_user_id === selectedVaultUser.id ? Number(t.creator_ngn || 0) : 0;
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</TableCell>
                          <TableCell>
                            <button type="button" className="inline-flex items-center gap-1 text-sm" onClick={() => setDetailKind('spent')}>
                              {spent || '—'} <Eye className="w-3.5 h-3.5 opacity-70" />
                            </button>
                          </TableCell>
                          <TableCell>
                            <button type="button" className="inline-flex items-center gap-1 text-sm" onClick={() => setDetailKind('received')}>
                              ₦{recv.toFixed(0)} <Eye className="w-3.5 h-3.5 opacity-70" />
                            </button>
                          </TableCell>
                          <TableCell>
                            <button type="button" className="inline-flex items-center gap-1 text-sm" onClick={() => setDetailKind('cashback')}>
                              ₦{cash.toFixed(0)} <Eye className="w-3.5 h-3.5 opacity-70" />
                            </button>
                          </TableCell>
                          <TableCell><Badge variant="outline">{t.source || 'tip'}</Badge></TableCell>
                          <TableCell><span className="text-xs">🟣 Not Verified</span></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold mb-2">Matrix earnings (period)</p>
                  {(() => {
                    const amounts = userTipRows.map((t: any) =>
                      (t.from_user_id === selectedVaultUser.id ? Number(t.viewer_ngn || 0) : 0) +
                      (t.to_user_id === selectedVaultUser.id ? Number(t.creator_ngn || 0) : 0)
                    );
                    const max = Math.max(1, ...amounts, 0);
                    const min = amounts.length ? Math.min(...amounts) : 0;
                    const hi = amounts.length ? Math.max(...amounts) : 0;
                    return (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Highest ₦{hi.toFixed(0)} · Lowest ₦{min.toFixed(0)} · Events {userTipRows.length}</p>
                        <div className="flex items-end gap-1 h-16">
                          {amounts.slice(0, 24).map((a, i) => (
                            <div key={i} className="flex-1 bg-primary/70 rounded-t" style={{ height: `${Math.max(4, (a / max) * 100)}%` }} />
                          ))}
                          {amounts.length === 0 && <p className="text-xs text-muted-foreground">No matrix data</p>}
                        </div>
                        <p className="text-xs text-muted-foreground">Reason: — (earning pauses / bans will show here)</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Detail sheet */}
            {detailKind && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setDetailKind(null)}>
                <div className="bg-background rounded-xl border w-full max-w-lg max-h-[80vh] overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      {detailKind === 'spent' && 'Star spent history'}
                      {detailKind === 'received' && 'Star / tip received'}
                      {detailKind === 'cashback' && 'Cashback history'}
                      {detailKind === 'platform' && 'Platform earnings history'}
                    </h3>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setDetailKind(null)}><X className="w-4 h-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    {(detailKind === 'platform' ? periodLedger : userTipRows).length === 0 && (
                      <p className="text-sm text-muted-foreground">No rows in this period.</p>
                    )}
                    {(detailKind === 'platform' ? periodLedger : userTipRows).map((t: any) => {
                      const otherId = detailKind === 'spent' ? t.to_user_id : t.from_user_id;
                      const uname = usernameMap[otherId] || (otherId ? String(otherId).slice(0, 8) : '—');
                      let line = '';
                      if (detailKind === 'spent') line = `⭐${t.stars || 0} → @${uname}`;
                      if (detailKind === 'received') line = `₦${Number(t.creator_ngn || 0).toFixed(0)} from tip`;
                      if (detailKind === 'cashback') line = `₦${Number(t.viewer_ngn || 0).toFixed(2)} cashback`;
                      if (detailKind === 'platform') {
                        let p = Number(t.platform_ngn || 0);
                        if (p === 0 && t.stars) {
                          const rate = Number(t.star_to_ngn_rate) || 300;
                          const pct = Number(settings.find(s => s.setting_key === 'split_platform_pct')?.setting_value) || 25;
                          p = Number(t.stars) * rate * pct / 100;
                        }
                        line = `₦${p.toFixed(0)} · ⭐${t.stars || 0} · ${t.source || 'tip'}`;
                      }
                      return (
                        <div key={t.id} className="rounded-lg border p-3 text-sm flex justify-between gap-2">
                          <div>
                            <p className="font-medium">{line}</p>
                            <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                          </div>
                          <Badge variant="outline">{t.source || 'tip'}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Raw ledger (period) */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">All tip events (period)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Stars</TableHead>
                    <TableHead>Creator ₦</TableHead>
                    <TableHead>Viewer ₦</TableHead>
                    <TableHead>Musician ₦</TableHead>
                    <TableHead>Platform ₦</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodLedger.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-muted-foreground text-sm">No events in this period.</TableCell></TableRow>
                  )}
                  {periodLedger.slice(0, 100).map((t: any) => {
                    let p = Number(t.platform_ngn || 0);
                    if (p === 0 && t.stars) {
                      const rate = Number(t.star_to_ngn_rate) || 300;
                      const pct = Number(settings.find(s => s.setting_key === 'split_platform_pct')?.setting_value) || 25;
                      p = Number(t.stars) * rate * pct / 100;
                    }
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</TableCell>
                        <TableCell>{t.stars}</TableCell>
                        <TableCell>₦{Number(t.creator_ngn || 0).toFixed(0)}</TableCell>
                        <TableCell>₦{Number(t.viewer_ngn || 0).toFixed(0)}</TableCell>
                        <TableCell>₦{Number(t.musician_ngn || 0).toFixed(0)}</TableCell>
                        <TableCell>₦{p.toFixed(0)}</TableCell>
                        <TableCell><Badge variant="outline">{t.source || 'tip'}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

    </Tabs>
  );
};

export default MonetizationTab;

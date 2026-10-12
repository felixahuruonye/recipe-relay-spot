import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type TipRow = {
  id: string | number;
  post_id?: string | null;
  from_user_id?: string | null;
  to_user_id?: string | null;
  stars?: number | null;
  star_to_ngn_rate?: number | null;
  amount_ngn?: number | null;
  creator_pct?: number | null;
  musician_pct?: number | null;
  viewer_pct?: number | null;
  platform_pct?: number | null;
  creator_ngn?: number | null;
  musician_ngn?: number | null;
  viewer_ngn?: number | null;
  platform_ngn?: number | null;
  source?: string | null;
  created_at: string;
  _from_wallet_history?: boolean;
};

const TUNABLE_KEYS = [
  'star_to_ngn_rate',
  'split_creator_pct',
  'split_creator_music_pct',
  'split_musician_pct',
  'split_viewer_cashback_pct',
  'split_platform_pct',
];

const PERIODS = ['7d', '14d', '28d', '30d', '60d', '90d', 'custom'] as const;

function platformShare(t: TipRow, settings: Setting[]): number {
  let p = Number(t.platform_ngn || 0);
  if (p > 0) return p;
  if (t.amount_ngn && t.platform_pct) {
    return (Number(t.amount_ngn) * Number(t.platform_pct)) / 100;
  }
  const stars = Number(t.stars || 0);
  if (stars > 0) {
    const rate =
      Number(t.star_to_ngn_rate) ||
      Number(settings.find((s) => s.setting_key === 'star_to_ngn_rate')?.setting_value) ||
      300;
    const pct =
      Number(settings.find((s) => s.setting_key === 'split_platform_pct')?.setting_value) || 25;
    return stars * rate * (pct / 100);
  }
  return 0;
}

export const MonetizationTab: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [tipLedger, setTipLedger] = useState<TipRow[]>([]);
  const [tipLoadError, setTipLoadError] = useState<string | null>(null);
  const [vaultRefreshing, setVaultRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [vaultPeriod, setVaultPeriod] = useState<(typeof PERIODS)[number]>('30d');
  const [vaultFrom, setVaultFrom] = useState('');
  const [vaultTo, setVaultTo] = useState('');
  const [vaultUserSearch, setVaultUserSearch] = useState('');
  const [selectedVaultUser, setSelectedVaultUser] = useState<UserRow | null>(null);
  const [detailKind, setDetailKind] = useState<'spent' | 'received' | 'cashback' | 'platform' | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: u } = await supabase
        .from('user_profiles')
        .select('id, username, monetization_level, earning_banned, view_earn_progress, follower_count, total_earned')
        .order('total_earned', { ascending: false })
        .limit(200);
      setUsers(((u as any) || []) as UserRow[]);

      const { data: s } = await supabase
        .from('admin_settings')
        .select('setting_key, setting_value, description')
        .in('setting_key', TUNABLE_KEYS);
      setSettings(((s as any) || []) as Setting[]);

      const { data: f } = await (supabase as any)
        .from('fraud_flags')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50);
      setFlags(f || []);

      const { data: e } = await (supabase as any)
        .from('monetization_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setEvents(e || []);

      const tipsRes = await (supabase as any)
        .from('tip_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!tipsRes.error && tipsRes.data && tipsRes.data.length > 0) {
        setTipLoadError(null);
        setTipLedger(tipsRes.data as TipRow[]);
      } else {
        if (tipsRes.error) {
          setTipLoadError(tipsRes.error.message || 'Cannot read tip_ledger');
        } else {
          setTipLoadError(null);
        }

        const histRes = await (supabase as any)
          .from('wallet_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300);

        if (histRes.error) {
          if (!tipsRes.error) {
            setTipLoadError('tip_ledger empty and wallet_history failed: ' + histRes.error.message);
          }
          setTipLedger([]);
        } else {
          const tipLike = ((histRes.data || []) as any[]).filter((h) => {
            const t = String(h.type || '').toLowerCase();
            return t.includes('tip') || t.includes('cashback');
          });
          const rows: TipRow[] = tipLike.map((h) => {
            const meta = h.meta || {};
            const amount = Number(h.amount || 0);
            const isCashback = String(h.type || '').toLowerCase().includes('cashback');
            return {
              id: h.id,
              post_id: meta.post_id || null,
              from_user_id: isCashback ? h.user_id : meta.from_user_id || null,
              to_user_id: isCashback ? meta.creator_id || null : h.user_id,
              stars: Number(meta.stars || 0),
              star_to_ngn_rate: meta.rate || null,
              amount_ngn: amount,
              creator_ngn: isCashback ? 0 : amount,
              musician_ngn: 0,
              viewer_ngn: isCashback ? amount : 0,
              platform_ngn: 0,
              source: meta.source || h.type || 'tip',
              created_at: h.created_at,
              _from_wallet_history: true,
            };
          });
          setTipLedger(rows);
          if (rows.length === 0 && !tipsRes.error) {
            setTipLoadError('No tip rows in tip_ledger or wallet_history yet.');
          }
        }
      }
      setBootError(null);
    } catch (err: any) {
      console.error(err);
      setBootError(err?.message || 'Failed to load monetization data');
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-monetization')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fraud_flags' }, () => { load(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'monetization_events' }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_ledger' }, () => { load(); })
      .subscribe();
    const poll = setInterval(() => { load(); }, 5000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [load]);

  const refreshVault = async () => {
    setVaultRefreshing(true);
    await load();
    setVaultRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter((u) => (u.username || '').toLowerCase().includes(q)) : users;
  }, [users, search]);

  const vaultRange = useMemo(() => {
    const now = new Date();
    if (vaultPeriod === 'custom') {
      return {
        from: vaultFrom ? new Date(vaultFrom) : null,
        to: vaultTo ? new Date(vaultTo + 'T23:59:59') : now,
      };
    }
    const days = parseInt(String(vaultPeriod).replace('d', ''), 10) || 30;
    return { from: new Date(now.getTime() - days * 86400000), to: now };
  }, [vaultPeriod, vaultFrom, vaultTo]);

  const periodLedger = useMemo(() => {
    const { from, to } = vaultRange;
    return tipLedger.filter((t) => {
      const d = new Date(t.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [tipLedger, vaultRange]);

  const vaultStats = useMemo(() => {
    const real = periodLedger.filter((t) => !t._from_wallet_history);
    const source = real.length > 0 ? real : periodLedger;
    let starsTipped = 0;
    let creatorNgn = 0;
    let viewerNgn = 0;
    let musicianNgn = 0;
    let platformNgn = 0;
    source.forEach((t) => {
      starsTipped += Number(t.stars || 0);
      creatorNgn += Number(t.creator_ngn || 0);
      viewerNgn += Number(t.viewer_ngn || 0);
      musicianNgn += Number(t.musician_ngn || 0);
      platformNgn += platformShare(t, settings);
    });
    return {
      totalTips: source.length,
      starsTipped,
      creatorNgn,
      viewerNgn,
      musicianNgn,
      platformNgn,
    };
  }, [periodLedger, settings]);

  const vaultUsers = useMemo(() => {
    const q = vaultUserSearch.trim().toLowerCase();
    const list = q ? users.filter((u) => (u.username || '').toLowerCase().includes(q)) : users;
    return list.slice(0, 100);
  }, [users, vaultUserSearch]);

  const userTipRows = useMemo(() => {
    if (!selectedVaultUser) return [] as TipRow[];
    const uid = selectedVaultUser.id;
    return periodLedger.filter((t) => t.from_user_id === uid || t.to_user_id === uid);
  }, [selectedVaultUser, periodLedger]);

  const setLevel = async (u: UserRow, level: number) => {
    const { data, error } = await supabase.rpc('admin_set_monetization_level' as any, {
      p_user_id: u.id,
      p_level: level,
    });
    if (error || !(data as any)?.success) {
      toast({ title: 'Failed', description: error?.message || 'Could not update level', variant: 'destructive' as any });
      return;
    }
    toast({ title: 'Updated', description: `@${u.username} → level ${level}` });
    load();
  };

  const saveSetting = async (key: string) => {
    const value = edits[key];
    if (value === undefined) return;
    const { error } = await supabase
      .from('admin_settings')
      .upsert({ setting_key: key, setting_value: value } as any, { onConflict: 'setting_key' });
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' as any });
      return;
    }
    toast({ title: 'Saved', description: key });
    load();
  };

  if (bootError) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <p className="text-destructive font-medium">Monetization failed to load</p>
          <p className="text-sm text-muted-foreground">{bootError}</p>
          <Button type="button" onClick={() => load()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="users" className="w-full">
      <TabsList className="flex flex-wrap h-auto gap-1">
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
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username…"
              className="sm:max-w-xs"
            />
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
                  <TableHead>Banned</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>@{u.username || u.id.slice(0, 8)}</TableCell>
                    <TableCell>{u.monetization_level ?? 0}</TableCell>
                    <TableCell>{u.follower_count ?? 0}</TableCell>
                    <TableCell>{u.view_earn_progress ?? 0}</TableCell>
                    <TableCell>₦{Number(u.total_earned || 0).toFixed(0)}</TableCell>
                    <TableCell>
                      {u.earning_banned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : (
                        <Badge variant="outline">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {[0, 1, 2, 3].map((lv) => (
                        <Button key={lv} type="button" size="sm" variant="outline" onClick={() => setLevel(u, lv)}>
                          L{lv}
                        </Button>
                      ))}
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
          <CardHeader>
            <CardTitle>Tunable Rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {TUNABLE_KEYS.map((key) => {
              const row = settings.find((s) => s.setting_key === key);
              const val = edits[key] ?? row?.setting_value ?? '';
              return (
                <div key={key} className="flex flex-col sm:flex-row gap-2 sm:items-center border rounded-lg p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{key}</p>
                    <p className="text-xs text-muted-foreground">{row?.description || 'Admin controlled'}</p>
                  </div>
                  <Input
                    className="sm:max-w-[140px]"
                    value={val}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                  <Button type="button" size="sm" onClick={() => saveSetting(key)}>
                    Save
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="flags">
        <Card>
          <CardHeader>
            <CardTitle>Fraud Queue</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No open flags
                    </TableCell>
                  </TableRow>
                )}
                {flags.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-xs">{f.created_at ? new Date(f.created_at).toLocaleString() : '—'}</TableCell>
                    <TableCell className="text-xs">{f.user_id || '—'}</TableCell>
                    <TableCell className="text-sm">{f.reason || f.flag_type || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{f.status || 'open'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="events">
        <Card>
          <CardHeader>
            <CardTitle>Monetization Ledger</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No events
                    </TableCell>
                  </TableRow>
                )}
                {events.map((ev: any) => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-xs">{ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}</TableCell>
                    <TableCell>{ev.event_type || ev.type || '—'}</TableCell>
                    <TableCell>{ev.amount != null ? String(ev.amount) : '—'}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{JSON.stringify(ev.meta || ev)}</TableCell>
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
                  Tip & cashback economics for the selected time period.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refreshVault()}
                disabled={vaultRefreshing}
                className="gap-2 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${vaultRefreshing ? 'animate-spin' : ''}`} />
                {vaultRefreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {PERIODS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={vaultPeriod === p ? 'default' : 'outline'}
                  className="h-8"
                  onClick={() => setVaultPeriod(p)}
                >
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
                <p className="text-muted-foreground text-xs">Creators</p>
                <p className="font-bold text-lg text-green-500">₦{vaultStats.creatorNgn.toFixed(0)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Viewers</p>
                <p className="font-bold text-lg text-sky-500">₦{vaultStats.viewerNgn.toFixed(0)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Musicians</p>
                <p className="font-bold text-lg text-violet-500">₦{vaultStats.musicianNgn.toFixed(0)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedVaultUser(null);
                  setDetailKind('platform');
                }}
                className="rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <p className="text-muted-foreground text-xs">Platform · tap history</p>
                <p className="font-bold text-lg text-amber-500">₦{vaultStats.platformNgn.toFixed(0)}</p>
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Users</p>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search username…"
                  value={vaultUserSearch}
                  onChange={(e) => setVaultUserSearch(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {vaultUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedVaultUser(u);
                      setDetailKind(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted/40 ${
                      selectedVaultUser?.id === u.id ? 'bg-muted' : ''
                    }`}
                  >
                    <span className="font-medium">@{u.username || u.id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      Not Verified
                    </Badge>
                  </button>
                ))}
                {vaultUsers.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No users match.</p>
                )}
              </div>
            </div>

            {selectedVaultUser && (
              <div className="space-y-2 border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">History · @{selectedVaultUser.username}</p>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedVaultUser(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <Badge className="bg-purple-600">Not Verified</Badge>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Star spent</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Cashbacks</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userTipRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground text-sm">
                          No tip activity in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {userTipRows.map((t) => {
                      const spent = t.from_user_id === selectedVaultUser.id ? Number(t.stars || 0) : 0;
                      const cash = t.from_user_id === selectedVaultUser.id ? Number(t.viewer_ngn || 0) : 0;
                      const recv = t.to_user_id === selectedVaultUser.id ? Number(t.creator_ngn || 0) : 0;
                      return (
                        <TableRow key={String(t.id)}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(t.created_at).toLocaleString()}
                          </TableCell>
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
                          <TableCell>
                            <Badge variant="outline">{t.source || 'tip'}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">Not Verified</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {detailKind && (
              <div
                className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
                onClick={() => setDetailKind(null)}
              >
                <div
                  className="bg-background rounded-xl border w-full max-w-lg max-h-[80vh] overflow-y-auto p-4 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">
                      {detailKind === 'spent' && 'Star spent history'}
                      {detailKind === 'received' && 'Tips received'}
                      {detailKind === 'cashback' && 'Cashback history'}
                      {detailKind === 'platform' && 'Platform earnings history'}
                    </h3>
                    <Button type="button" size="icon" variant="ghost" onClick={() => setDetailKind(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(detailKind === 'platform' ? periodLedger : userTipRows).length === 0 && (
                      <p className="text-sm text-muted-foreground">No rows in this period.</p>
                    )}
                    {(detailKind === 'platform' ? periodLedger : userTipRows).map((t) => {
                      let line = '';
                      if (detailKind === 'spent') line = `⭐${t.stars || 0} tipped`;
                      if (detailKind === 'received') line = `₦${Number(t.creator_ngn || 0).toFixed(0)} from tip`;
                      if (detailKind === 'cashback') line = `₦${Number(t.viewer_ngn || 0).toFixed(2)} cashback`;
                      if (detailKind === 'platform') {
                        line = `₦${platformShare(t, settings).toFixed(0)} · ⭐${t.stars || 0} · ${t.source || 'tip'}`;
                      }
                      return (
                        <div key={String(t.id)} className="rounded-lg border p-3 text-sm flex justify-between gap-2">
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

            <div className="space-y-2">
              <p className="text-sm font-semibold">All tip events (period)</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Stars</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Viewer</TableHead>
                    <TableHead>Musician</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodLedger.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground text-sm">
                        No events in this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {periodLedger.slice(0, 100).map((t) => (
                    <TableRow key={String(t.id)}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(t.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{t.stars ?? 0}</TableCell>
                      <TableCell>₦{Number(t.creator_ngn || 0).toFixed(0)}</TableCell>
                      <TableCell>₦{Number(t.viewer_ngn || 0).toFixed(0)}</TableCell>
                      <TableCell>₦{Number(t.musician_ngn || 0).toFixed(0)}</TableCell>
                      <TableCell>₦{platformShare(t, settings).toFixed(0)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.source || 'tip'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
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

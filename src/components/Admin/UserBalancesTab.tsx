import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type UserRow = {
  id: string;
  username: string;
  full_name: string | null;
  vip: boolean | null;
  wallet_balance: number | null;
  star_balance: number | null;
  is_suspended: boolean | null;
};

export const UserBalancesTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, { wallet?: string; stars?: string; reason?: string }>>({});

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-users-balances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, full_name, vip, wallet_balance, star_balance, is_suspended')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setUsers((data as any) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => (u.username || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q));
  }, [users, search]);

  const getEdit = (userId: string) => edits[userId] || {};

  const setEdit = (userId: string, patch: Partial<{ wallet: string; stars: string; reason: string }>) => {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], ...patch }
    }));
  };

  const save = async (u: UserRow) => {
    const e = getEdit(u.id);
    const nextWallet = e.wallet === undefined || e.wallet === '' ? null : Number(e.wallet);
    const nextStars = e.stars === undefined || e.stars === '' ? null : Number(e.stars);

    if (nextWallet !== null && !Number.isFinite(nextWallet)) {
      toast({ title: 'Invalid wallet value', description: 'Enter a valid number.', variant: 'destructive' });
      return;
    }
    if (nextStars !== null && !Number.isFinite(nextStars)) {
      toast({ title: 'Invalid stars value', description: 'Enter a valid number.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.rpc('admin_set_user_balances', {
      p_user_id: u.id,
      p_wallet_balance: nextWallet,
      p_star_balance: nextStars,
      p_reason: e.reason || null
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Updated', description: `Balances updated for ${u.username}` });
    setEdits((prev) => {
      const copy = { ...prev };
      delete copy[u.id];
      return copy;
    });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>User Balances</CardTitle>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username/name…" className="sm:max-w-xs" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading users…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wallet (₦)</TableHead>
                  <TableHead>Stars</TableHead>
                  <TableHead className="min-w-[220px]">Reason (optional)</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const e = getEdit(u.id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.username}</div>
                        <div className="text-xs text-muted-foreground">{u.full_name || ''}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {u.vip ? <Badge variant="secondary">VIP</Badge> : <Badge variant="outline">Free</Badge>}
                          {u.is_suspended ? <Badge variant="destructive">Suspended</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder={String(u.wallet_balance ?? 0)}
                          value={e.wallet ?? ''}
                          onChange={(ev) => setEdit(u.id, { wallet: ev.target.value })}
                          className="h-8 w-32"
                        />
                        <div className="text-xs text-muted-foreground mt-1">Current: ₦{(u.wallet_balance ?? 0).toLocaleString()}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder={String(u.star_balance ?? 0)}
                          value={e.stars ?? ''}
                          onChange={(ev) => setEdit(u.id, { stars: ev.target.value })}
                          className="h-8 w-24"
                        />
                        <div className="text-xs text-muted-foreground mt-1">Current: {(u.star_balance ?? 0).toLocaleString()}</div>
                      </TableCell>
                      <TableCell>
                        <Input value={e.reason ?? ''} onChange={(ev) => setEdit(u.id, { reason: ev.target.value })} placeholder="e.g., manual adjustment" className="h-8" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => save(u)} disabled={e.wallet === undefined && e.stars === undefined}>
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

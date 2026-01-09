import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type PaymentRequestRow = {
  id: string;
  user_id: string | null;
  amount: number;
  currency_symbol: string | null;
  payment_method: string;
  account_info: any;
  status: string | null;
  created_at: string | null;
  admin_notes: string | null;
};

type ProfileMini = { id: string; username: string; avatar_url: string | null };

export const WithdrawalsTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PaymentRequestRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});

  const [actionOpen, setActionOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentRequestRow | null>(null);
  const [nextStatus, setNextStatus] = useState<'pending' | 'processing' | 'paid' | 'rejected'>('processing');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-withdrawals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const list = (data as any as PaymentRequestRow[]) || [];
    setRows(list);

    const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
    if (userIds.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id, username, avatar_url').in('id', userIds);
      const map: Record<string, ProfileMini> = {};
      (profs as any as ProfileMini[] | null)?.forEach((p) => {
        map[p.id] = p;
      });
      setProfiles(map);
    } else {
      setProfiles({});
    }

    setLoading(false);
  };

  const pendingCount = useMemo(() => rows.filter((r) => (r.status ?? 'pending') === 'pending').length, [rows]);

  const openAction = (row: PaymentRequestRow, status: 'pending' | 'processing' | 'paid' | 'rejected') => {
    setSelected(row);
    setNextStatus(status);
    setNotes(row.admin_notes || '');
    setActionOpen(true);
  };

  const applyAction = async () => {
    if (!selected) return;

    const { error } = await supabase.rpc('admin_update_payment_request', {
      p_request_id: selected.id,
      p_status: nextStatus,
      p_admin_notes: notes || null
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Updated', description: `Withdrawal marked ${nextStatus}` });
    setActionOpen(false);
    setSelected(null);
    setNotes('');
    load();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Withdrawals ({pendingCount} pending)</CardTitle>
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading withdrawal requests…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No withdrawal requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const prof = r.user_id ? profiles[r.user_id] : undefined;
                    const status = (r.status ?? 'pending') as string;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{prof?.username || r.user_id || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {r.currency_symbol || '₦'}{Number(r.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>{r.payment_method}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === 'paid'
                                ? 'secondary'
                                : status === 'rejected'
                                  ? 'destructive'
                                  : status === 'processing'
                                    ? 'outline'
                                    : 'default'
                            }
                          >
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => openAction(r, 'processing')}>
                              Processing
                            </Button>
                            <Button size="sm" onClick={() => openAction(r, 'paid')}>
                              Paid
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => openAction(r, 'rejected')}>
                              Reject
                            </Button>
                          </div>
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

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Withdrawal</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="text-muted-foreground">Request</div>
                <div className="font-mono text-xs">{selected.id}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground">New status</div>
                <div className="font-semibold">{nextStatus}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Admin notes (optional)</div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Add payout reference, reason, etc." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setActionOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={applyAction}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

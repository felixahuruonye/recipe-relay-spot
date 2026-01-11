import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Eye, MessageSquare, RefreshCw } from 'lucide-react';

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
  const [viewOpen, setViewOpen] = useState(false);
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

  const openView = (row: PaymentRequestRow) => {
    setSelected(row);
    setViewOpen(true);
  };

  const applyAction = async () => {
    if (!selected) return;

    // Update payment request directly
    const { error: updateError } = await supabase
      .from('payment_requests')
      .update({ 
        status: nextStatus, 
        admin_notes: notes || null,
        processed_at: new Date().toISOString()
      })
      .eq('id', selected.id);

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
      return;
    }

    // Send notification to user about status update
    if (selected.user_id) {
      const statusMessages: Record<string, string> = {
        processing: 'Your withdrawal request is being processed.',
        paid: 'Your withdrawal has been paid! Check your account.',
        rejected: `Your withdrawal was rejected. ${notes ? `Reason: ${notes}` : 'Contact admin for details.'}`
      };

      await supabase.from('user_notifications').insert({
        user_id: selected.user_id,
        title: `Withdrawal ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`,
        message: statusMessages[nextStatus] || `Your withdrawal status: ${nextStatus}`,
        type: 'withdrawal',
        notification_category: 'admin'
      });
    }

    toast({ title: 'Updated', description: `Withdrawal marked ${nextStatus}` });
    setActionOpen(false);
    setSelected(null);
    setNotes('');
    load();
  };

  const sendMessage = async () => {
    if (!selected || !notes.trim() || !selected.user_id) return;

    // Send message as notification
    const { error } = await supabase.from('user_notifications').insert({
      user_id: selected.user_id,
      title: 'Message from Admin',
      message: notes.trim(),
      type: 'admin_message',
      notification_category: 'admin'
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    // Also update admin_notes on the request
    await supabase
      .from('payment_requests')
      .update({ admin_notes: notes.trim() })
      .eq('id', selected.id);

    toast({ title: 'Sent', description: 'Message sent to user notifications' });
    setNotes('');
  };

  const renderAccountInfo = (info: any) => {
    if (!info) return <span className="text-muted-foreground">No details</span>;
    
    if (typeof info === 'string') {
      try {
        info = JSON.parse(info);
      } catch {
        return <span>{info}</span>;
      }
    }

    return (
      <div className="space-y-2 text-sm">
        {Object.entries(info).map(([key, value]) => (
          <div key={key} className="flex justify-between border-b pb-1">
            <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
            <span className="text-muted-foreground">{String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Withdrawals ({pendingCount} pending)</CardTitle>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
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
                          <div className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">{r.id}</div>
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
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => openView(r)} title="View Details">
                              <Eye className="w-4 h-4" />
                            </Button>
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

      {/* View Details Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Withdrawal Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">User</p>
                  <p className="font-medium">{profiles[selected.user_id || '']?.username || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">{selected.currency_symbol || '₦'}{Number(selected.amount).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Method</p>
                  <p className="font-medium">{selected.payment_method}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge>{selected.status || 'pending'}</Badge>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Account/Payment Details</p>
                <div className="bg-muted p-4 rounded-lg">
                  {renderAccountInfo(selected.account_info)}
                </div>
              </div>

              {selected.admin_notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Admin Notes</p>
                  <p className="text-sm">{selected.admin_notes}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Send Message to User</p>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Type a message to send to the user..."
                  rows={3}
                />
                <Button size="sm" className="mt-2" onClick={sendMessage} disabled={!notes.trim()}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Send Message
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
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
                <div className="text-sm text-muted-foreground mb-1">Admin notes / Message to user</div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Add payout reference, reason, or message to user..." />
                <p className="text-xs text-muted-foreground mt-1">This note will be sent to user notifications</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setActionOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={applyAction}>Save & Notify User</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
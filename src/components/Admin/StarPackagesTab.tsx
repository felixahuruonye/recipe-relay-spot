import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type StarPackageRow = {
  id: string;
  stars: number;
  price_naira: number;
  notes: string | null;
  purchase_url: string | null;
  status: string | null;
  updated_at: string | null;
};

export const StarPackagesTab: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StarPackageRow[]>([]);
  const [edits, setEdits] = useState<Record<string, { purchase_url?: string; price_naira?: string; notes?: string; status?: string }>>({});

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-star-packages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'star_packages' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('star_packages')
      .select('id, stars, price_naira, notes, purchase_url, status, updated_at')
      .order('stars', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setRows((data as any) || []);
    setLoading(false);
  };

  const setEdit = (id: string, patch: any) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const save = async (row: StarPackageRow) => {
    const e = edits[row.id] || {};
    const nextPrice = e.price_naira === undefined || e.price_naira === '' ? undefined : Number(e.price_naira);

    if (nextPrice !== undefined && !Number.isFinite(nextPrice)) {
      toast({ title: 'Invalid price', description: 'Enter a valid number.', variant: 'destructive' });
      return;
    }

    const patch: any = {};
    if (e.purchase_url !== undefined) patch.purchase_url = e.purchase_url || null;
    if (e.notes !== undefined) patch.notes = e.notes || null;
    if (e.status !== undefined) patch.status = e.status;
    if (nextPrice !== undefined) patch.price_naira = nextPrice;

    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase.from('star_packages').update(patch).eq('id', row.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Saved', description: `Updated package ${row.stars}⭐` });
    setEdits((prev) => {
      const copy = { ...prev };
      delete copy[row.id];
      return copy;
    });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Star Packages (purchase URLs)</CardTitle>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-10 text-muted-foreground">Loading star packages…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stars</TableHead>
                  <TableHead>Price (₦)</TableHead>
                  <TableHead className="min-w-[260px]">Purchase URL</TableHead>
                  <TableHead className="min-w-[220px]">Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const e = edits[r.id] || {};
                  const status = e.status ?? r.status ?? 'enabled';
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-semibold">{r.stars.toLocaleString()}⭐</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 w-32"
                          defaultValue={r.price_naira}
                          onChange={(ev) => setEdit(r.id, { price_naira: ev.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          placeholder="https://paystack.com/pay/..."
                          defaultValue={r.purchase_url || ''}
                          onChange={(ev) => setEdit(r.id, { purchase_url: ev.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input defaultValue={r.notes || ''} className="h-8" onChange={(ev) => setEdit(r.id, { notes: ev.target.value })} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={status === 'enabled' ? 'secondary' : 'outline'}>{status}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEdit(r.id, { status: status === 'enabled' ? 'disabled' : 'enabled' })}
                          >
                            Toggle
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => save(r)} disabled={!edits[r.id]}>
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

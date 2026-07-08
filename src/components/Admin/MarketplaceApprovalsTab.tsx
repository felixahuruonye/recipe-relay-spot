import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, RefreshCw, Package } from 'lucide-react';

interface PendingProduct {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  images: string[];
  seller_user_id: string;
  seller_contact: string | null;
  created_at: string;
  approval_status: string;
}

export const MarketplaceApprovalsTab: React.FC = () => {
  const [items, setItems] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { username: string; avatar_url: string | null }>>({});
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id,title,description,price_ngn,images,seller_user_id,seller_contact,created_at,approval_status')
      .eq('approval_status', filter)
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    setItems((data as any) || []);
    const ids = Array.from(new Set(((data as any) || []).map((p: any) => p.seller_user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from('user_profiles').select('id,username,avatar_url').in('id', ids);
      const map: any = {};
      (profs || []).forEach((p: any) => (map[p.id] = p));
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-product-approvals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [filter]);

  const approve = async (id: string) => {
    const { error } = await supabase.rpc('admin_approve_product', { p_id: id });
    if (error) return toast({ title: 'Approve failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Product approved', description: 'Now live in the marketplace.' });
    load();
  };

  const reject = async () => {
    if (!rejectFor) return;
    const { error } = await supabase.rpc('admin_reject_product', { p_id: rejectFor, p_reason: rejectReason || null });
    if (error) return toast({ title: 'Reject failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Product rejected' });
    setRejectFor(null); setRejectReason('');
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" /> Marketplace Approvals</CardTitle>
        <div className="flex items-center gap-2">
          {(['pending','approved','rejected'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : items.length === 0 ? <p className="text-sm text-muted-foreground">No {filter} products.</p>
          : (
            <div className="space-y-3">
              {items.map((p) => (
                <div key={p.id} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
                  {p.images?.[0] ? <img src={p.images[0]} alt="" className="w-20 h-20 object-cover rounded" /> : <div className="w-20 h-20 bg-muted rounded" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{p.title}</span>
                      <Badge variant="outline">₦{Number(p.price_ngn).toLocaleString()}</Badge>
                      <Badge>{p.approval_status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Seller: @{profiles[p.seller_user_id]?.username || p.seller_user_id.slice(0,8)}</p>
                    <p className="text-sm mt-1 line-clamp-2">{p.description}</p>
                    {rejectFor === p.id && (
                      <div className="mt-2 space-y-2">
                        <Textarea placeholder="Reason (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={reject}>Confirm reject</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setRejectFor(null); setRejectReason(''); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  {filter === 'pending' && rejectFor !== p.id && (
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => approve(p.id)}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectFor(p.id)}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </CardContent>
    </Card>
  );
};

export default MarketplaceApprovalsTab;

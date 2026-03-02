import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Truck, Plus, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const DeliveriesTab = () => {
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [sellers, setSellers] = useState<Record<string, any>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOrder, setNewOrder] = useState({
    product_id: '', seller_id: '', buyer_id: '',
    customer_name: '', customer_location: '', customer_address: '',
    customer_phone: '', customer_email: '', delivery_date: '',
    amount_paid: '', amount_charged: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from('marketplace_deliveries').select('*').order('created_at', { ascending: false });
    setDeliveries((data as any[]) || []);

    const { data: prods } = await supabase.from('products').select('id, title, seller_user_id').limit(100);
    setProducts(prods || []);

    const sellerIds = [...new Set((prods || []).map(p => p.seller_user_id))];
    if (sellerIds.length) {
      const { data: profiles } = await supabase.from('user_profiles').select('id, username').in('id', sellerIds);
      const map: Record<string, any> = {};
      profiles?.forEach(p => { map[p.id] = p; });
      setSellers(map);
    }
  };

  const addBoughtProduct = async () => {
    const product = products.find(p => p.id === newOrder.product_id);
    if (!product) { toast({ title: 'Select a product', variant: 'destructive' }); return; }

    const { error } = await supabase.from('marketplace_deliveries').insert({
      product_id: newOrder.product_id,
      seller_id: product.seller_user_id,
      buyer_id: newOrder.buyer_id || product.seller_user_id,
      delivery_method: 'pending',
      customer_name: newOrder.customer_name,
      customer_location: newOrder.customer_location,
      customer_address: newOrder.customer_address,
      customer_phone: newOrder.customer_phone,
      customer_email: newOrder.customer_email,
      delivery_date: newOrder.delivery_date,
      amount_paid: parseFloat(newOrder.amount_paid) || 0,
      amount_charged: parseFloat(newOrder.amount_charged) || 0,
    } as any);

    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    // Notify seller
    await supabase.from('user_notifications').insert({
      user_id: product.seller_user_id,
      title: '🛒 New Order!',
      message: `A customer bought your product. Check Bought Products in Marketplace.`,
      type: 'system', notification_category: 'marketplace'
    });

    toast({ title: 'Bought product added!' });
    setShowAddForm(false);
    setNewOrder({ product_id: '', seller_id: '', buyer_id: '', customer_name: '', customer_location: '', customer_address: '', customer_phone: '', customer_email: '', delivery_date: '', amount_paid: '', amount_charged: '' });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('marketplace_deliveries').update({ status } as any).eq('id', id);
    const delivery = deliveries.find(d => d.id === id);
    if (delivery) {
      // Notify both seller and buyer
      const msg = status === 'delivered' ? '✅ Your product has been delivered!' : status === 'on_the_way' ? '🚚 Your product is on the way!' : `Delivery status: ${status}`;
      await supabase.from('user_notifications').insert([
        { user_id: delivery.seller_id, title: 'Delivery Update', message: msg, type: 'system', notification_category: 'delivery' },
        { user_id: delivery.buyer_id, title: 'Delivery Update', message: msg, type: 'system', notification_category: 'delivery' }
      ]);
    }
    toast({ title: `Status updated to ${status}` });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5" /> Deliveries</CardTitle>
          <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Bought Product</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Customer Order</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Select value={newOrder.product_id} onValueChange={v => setNewOrder(p => ({...p, product_id: v}))}>
                  <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.title} ({sellers[p.seller_user_id]?.username})</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Customer Full Name" value={newOrder.customer_name} onChange={e => setNewOrder(p => ({...p, customer_name: e.target.value}))} />
                <Input placeholder="Location (State, Country)" value={newOrder.customer_location} onChange={e => setNewOrder(p => ({...p, customer_location: e.target.value}))} />
                <Input placeholder="Delivery Address" value={newOrder.customer_address} onChange={e => setNewOrder(p => ({...p, customer_address: e.target.value}))} />
                <Input placeholder="Customer Phone" value={newOrder.customer_phone} onChange={e => setNewOrder(p => ({...p, customer_phone: e.target.value}))} />
                <Input placeholder="Customer Email" value={newOrder.customer_email} onChange={e => setNewOrder(p => ({...p, customer_email: e.target.value}))} />
                <Input type="date" placeholder="Delivery Date" value={newOrder.delivery_date} onChange={e => setNewOrder(p => ({...p, delivery_date: e.target.value}))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" placeholder="Amount Paid" value={newOrder.amount_paid} onChange={e => setNewOrder(p => ({...p, amount_paid: e.target.value}))} />
                  <Input type="number" placeholder="Amount Charged" value={newOrder.amount_charged} onChange={e => setNewOrder(p => ({...p, amount_charged: e.target.value}))} />
                </div>
                <Button className="w-full" onClick={addBoughtProduct}>Add Order</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {deliveries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2" /> No deliveries yet</div>
        ) : (
          <div className="space-y-3">
            {deliveries.map(d => (
              <div key={d.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">Product: {d.product_id}</span>
                  <Badge variant={d.status === 'delivered' ? 'default' : d.status === 'on_the_way' ? 'secondary' : 'outline'}>{d.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>Customer: {d.customer_name}</div>
                  <div>Location: {d.customer_location}</div>
                  <div>Address: {d.customer_address}</div>
                  <div>Phone: {d.customer_phone}</div>
                  <div>Email: {d.customer_email}</div>
                  <div>Method: {d.delivery_method}</div>
                  <div>Paid: ₦{d.amount_paid}</div>
                  <div>Charged: ₦{d.amount_charged}</div>
                </div>
                <div className="flex gap-2">
                  {d.status !== 'on_the_way' && d.status !== 'delivered' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(d.id, 'on_the_way')}>Mark On The Way</Button>
                  )}
                  {d.status !== 'delivered' && (
                    <Button size="sm" onClick={() => updateStatus(d.id, 'delivered')}>Mark Delivered</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

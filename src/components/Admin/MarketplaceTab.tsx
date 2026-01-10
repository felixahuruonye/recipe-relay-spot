import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Eye, Link, Trash2, RefreshCw, Bell, ShoppingBag } from 'lucide-react';

interface Product {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  stock: number;
  images: string[];
  status: string;
  created_at: string;
  seller_user_id: string;
  seller_contact: string;
  delivery_options: string;
  featured: boolean;
  purchase_url?: string;
  view_count?: number;
  click_count?: number;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

export const MarketplaceTab: React.FC = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [newProductsCount, setNewProductsCount] = useState(0);

  useEffect(() => {
    loadProducts();
    
    // Real-time updates
    const channel = supabase
      .channel('admin-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setNewProductsCount(prev => prev + 1);
          toast({
            title: '🛒 New Product Added',
            description: 'A new product has been listed on the marketplace.'
          });
        }
        loadProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setNewProductsCount(0);

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setProducts(data || []);

    // Fetch user profiles
    const userIds = [...new Set((data || []).map(p => p.seller_user_id))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      const map: Record<string, Profile> = {};
      profs?.forEach(p => { map[p.id] = p; });
      setProfiles(map);
    }

    setLoading(false);
  };

  const deleteProduct = async (productId: string) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: 'Product removed from marketplace.' });
      loadProducts();
    }
  };

  const updateProductStatus = async (productId: string, status: string) => {
    const { error } = await supabase
      .from('products')
      .update({ status })
      .eq('id', productId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Product status set to ${status}` });
      loadProducts();
    }
  };

  const openUrlDialog = (product: Product) => {
    setSelectedProduct(product);
    setPaymentUrl('');
    setShowUrlDialog(true);
  };

  const savePaymentUrl = async () => {
    if (!selectedProduct) return;

    // Store the URL in admin_settings or a products metadata
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_key: `product_payment_url_${selectedProduct.id}`,
        setting_value: paymentUrl,
        setting_type: 'payment_url',
        description: `Payment URL for product: ${selectedProduct.title}`
      }, { onConflict: 'setting_key' });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Payment URL has been saved.' });
      setShowUrlDialog(false);
    }
  };

  const toggleFeatured = async (productId: string, currentFeatured: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ featured: !currentFeatured })
      .eq('id', productId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: `Product ${!currentFeatured ? 'featured' : 'unfeatured'}.` });
      loadProducts();
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            <CardTitle>Marketplace Products ({products.length})</CardTitle>
            {newProductsCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                <Bell className="w-3 h-3 mr-1" />
                {newProductsCount} New
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={loadProducts}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No products listed yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Views</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const seller = profiles[product.seller_user_id];
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {product.images?.[0] && (
                              <img 
                                src={product.images[0]} 
                                alt={product.title}
                                className="w-10 h-10 object-cover rounded"
                              />
                            )}
                            <div>
                              <div className="font-medium max-w-[150px] truncate">{product.title}</div>
                              {product.featured && (
                                <Badge variant="secondary" className="text-xs">Featured</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{seller?.username || 'Unknown'}</TableCell>
                        <TableCell>₦{Number(product.price_ngn).toLocaleString()}</TableCell>
                        <TableCell>{product.stock}</TableCell>
                        <TableCell>
                          <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                            {product.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{product.view_count || 0}</TableCell>
                        <TableCell>{product.click_count || 0}</TableCell>
                        <TableCell>{new Date(product.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => openUrlDialog(product)}
                              title="Add Payment URL"
                            >
                              <Link className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => toggleFeatured(product.id, product.featured)}
                            >
                              {product.featured ? 'Unfeature' : 'Feature'}
                            </Button>
                            {product.status !== 'active' ? (
                              <Button size="sm" onClick={() => updateProductStatus(product.id, 'active')}>
                                Approve
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => updateProductStatus(product.id, 'inactive')}>
                                Deactivate
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => deleteProduct(product.id)}
                            >
                              <Trash2 className="w-4 h-4" />
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

      <Dialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Payment URL for "{selectedProduct?.title}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Payment URL</label>
              <Input
                value={paymentUrl}
                onChange={(e) => setPaymentUrl(e.target.value)}
                placeholder="https://paystack.com/pay/..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowUrlDialog(false)}>Cancel</Button>
              <Button onClick={savePaymentUrl}>Save URL</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

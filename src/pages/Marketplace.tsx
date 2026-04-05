import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingBag, Star, Crown, Package, Search, Upload, Edit2, Trash2, Eye, Copy, Share2, Truck, MessageCircle, ArrowLeft, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Product {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  stock: number;
  delivery_options: string;
  images: string[];
  featured: boolean;
  seller_contact: string;
  created_at: string;
  seller_user_id: string;
  status: string;
  user_profiles?: { username: string; avatar_url: string; vip: boolean };
}

interface Review {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  review: string;
  created_at: string;
  profile?: { username: string; avatar_url: string };
}

interface Delivery {
  id: string;
  product_id: string;
  buyer_id: string;
  delivery_method: string;
  status: string;
  customer_name: string;
  customer_location: string;
  customer_address: string;
  customer_phone: string;
  customer_email: string;
  delivery_date: string;
  amount_paid: number;
  amount_charged: number;
  seller_name: string;
  created_at: string;
}

const SELLER_GUIDE = `## How to Sell on Lenory Marketplace

**Rules & Guidelines:**
1. Only VIP members can list products
2. Upload up to 5 product images
3. Set a fair price in Naira (₦)
4. Provide accurate delivery information

**Delivery Options:**
- 🚚 **Self Delivery** — You handle shipping directly to the customer
- 🚚 **Lenory Express Delivery** — We pick up and deliver (50 Stars fee)

**Invoice:** Generate a professional invoice for 30 Stars per product.

**Refund Policy:** Choose whether you offer refunds. Customers will be informed.

**After a Sale:** Admin will update your Bought Products page with customer details. You then choose a delivery method and fill in the required form.

Click **Continue** to start selling!`;

const Marketplace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newReview, setNewReview] = useState({ rating: 5, text: '' });
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [deliveryForm, setDeliveryForm] = useState<any>(null);
  const [paymentUrls, setPaymentUrls] = useState<Record<string, string>>({});
  const [newProduct, setNewProduct] = useState({ title: '', description: '', price: '', stock: '', delivery_options: '', seller_contact: '' });
  const [productImages, setProductImages] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState('browse');

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchProducts();
      fetchMyProducts();
      fetchPaymentUrls();
    }
  }, [user]);

  useEffect(() => {
    // Check URL for product param
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('product');
    if (pid && products.length > 0) {
      const p = products.find(pr => pr.id === pid);
      if (p) openProductDetail(p);
    }
  }, [products]);

  const fetchUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
    setUserProfile(data);
  };

  const fetchPaymentUrls = async () => {
    const { data } = await supabase.from('admin_settings').select('setting_key, setting_value').like('setting_key', 'product_payment_url_%');
    const urls: Record<string, string> = {};
    data?.forEach(item => { urls[item.setting_key.replace('product_payment_url_', '')] = item.setting_value || ''; });
    setPaymentUrls(urls);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('status', 'active').order('featured', { ascending: false }).order('created_at', { ascending: false });
    const userIds = [...new Set(data?.map(p => p.seller_user_id) || [])];
    const { data: profiles } = await supabase.from('user_profiles').select('id, username, avatar_url, vip').in('id', userIds.length ? userIds : ['none']);
    const profileMap = new Map(profiles?.map(p => [p.id, p]));
    setProducts((data || []).map(p => ({ ...p, user_profiles: profileMap.get(p.seller_user_id) as any })));
    setLoading(false);
  };

  const fetchMyProducts = async () => {
    if (!user) return;
    const { data } = await supabase.from('products').select('*').eq('seller_user_id', user.id).order('created_at', { ascending: false });
    setMyProducts(data || []);
  };

  const fetchDeliveries = async () => {
    if (!user) return;
    const { data } = await supabase.from('marketplace_deliveries').select('*').eq('seller_id', user.id).order('created_at', { ascending: false });
    setDeliveries((data as any[]) || []);
  };

  const openProductDetail = async (product: Product) => {
    setSelectedProduct(product);
    setSelectedImageIdx(0);
    // Fetch reviews
    const { data: revs } = await supabase.from('product_reviews').select('*').eq('product_id', product.id).order('created_at', { ascending: false });
    const reviewUserIds = [...new Set((revs || []).map(r => r.user_id))];
    const { data: profs } = await supabase.from('user_profiles').select('id, username, avatar_url').in('id', reviewUserIds.length ? reviewUserIds : ['none']);
    const profMap = new Map(profs?.map(p => [p.id, p]));
    setReviews((revs || []).map(r => ({ ...r, profile: profMap.get(r.user_id) as any })));
  };

  const submitReview = async () => {
    if (!user || !selectedProduct) return;
    const { error } = await supabase.from('product_reviews').insert({
      product_id: selectedProduct.id,
      user_id: user.id,
      rating: newReview.rating,
      review: newReview.text
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Review added!' });
      setNewReview({ rating: 5, text: '' });
      openProductDetail(selectedProduct);
    }
  };

  const uploadProductImages = async (): Promise<string[]> => {
    if (!productImages.length || !user) return [];
    const results = await Promise.all(productImages.map(async (file, i) => {
      const ext = file.name.split('.').pop();
      const fileName = `${user.id}/products/${Date.now()}-${i}.${ext}`;
      const { error } = await supabase.storage.from('post-media').upload(fileName, file);
      if (error) return null;
      return supabase.storage.from('post-media').getPublicUrl(fileName).data.publicUrl;
    }));
    return results.filter((u): u is string => u !== null);
  };

  const createProduct = async () => {
    if (!user || !userProfile?.vip) { toast({ title: 'VIP Required', variant: 'destructive' }); return; }
    if (!newProduct.title || !newProduct.price) { toast({ title: 'Fill required fields', variant: 'destructive' }); return; }
    const imageUrls = await uploadProductImages();
    const { error } = await supabase.from('products').insert({
      seller_user_id: user.id, title: newProduct.title.trim(), description: newProduct.description.trim(),
      price_ngn: parseFloat(newProduct.price), stock: parseInt(newProduct.stock) || 1,
      delivery_options: newProduct.delivery_options.trim(), seller_contact: newProduct.seller_contact.trim(),
      images: imageUrls, status: 'active'
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Product listed!' });
    setNewProduct({ title: '', description: '', price: '', stock: '', delivery_options: '', seller_contact: '' });
    setProductImages([]);
    setShowCreateDialog(false);
    fetchProducts(); fetchMyProducts();
  };

  const updateProduct = async () => {
    if (!editingProduct) return;
    await supabase.from('products').update({
      title: editingProduct.title, description: editingProduct.description,
      price_ngn: editingProduct.price_ngn, stock: editingProduct.stock,
      delivery_options: editingProduct.delivery_options, seller_contact: editingProduct.seller_contact
    }).eq('id', editingProduct.id);
    toast({ title: 'Updated!' }); setShowEditDialog(false); fetchMyProducts();
  };

  const deleteProduct = async (id: string) => {
    await supabase.from('products').delete().eq('id', id);
    toast({ title: 'Deleted' }); fetchMyProducts(); fetchProducts();
  };

  const buyProduct = (product: Product) => {
    const url = paymentUrls[product.id];
    if (url) { window.open(url, '_blank'); return; }
    window.open(`https://paystack.com/pay/lernory-product`, '_blank');
  };

  const copyLink = (p: Product) => {
    navigator.clipboard.writeText(`${window.location.origin}/marketplace?product=${p.id}`);
    toast({ title: 'Link copied!' });
  };

  const shareProduct = (p: Product) => {
    const link = `${window.location.origin}/marketplace?product=${p.id}`;
    if (navigator.share) { navigator.share({ title: p.title, url: link }); }
    else { window.open(`https://wa.me/?text=${encodeURIComponent(`Check out "${p.title}" ₦${p.price_ngn.toLocaleString()} ${link}`)}`, '_blank'); }
  };

  const submitDeliveryForm = async (method: 'self' | 'savemore') => {
    if (!user || !deliveryForm) return;
    const starCost = method === 'savemore' ? 50 : 0;
    if (starCost > 0) {
      const { data: ok } = await supabase.rpc('deduct_stars_for_service', { p_user_id: user.id, p_amount: starCost, p_description: 'Lenory Express Delivery fee' });
      if (!ok) { toast({ title: 'Not enough Stars', description: `You need ${starCost} Stars`, variant: 'destructive' }); return; }
    }
    const { error } = await supabase.from('marketplace_deliveries').insert({
      product_id: deliveryForm.product_id, seller_id: user.id, buyer_id: deliveryForm.buyer_id || user.id,
      delivery_method: method, seller_name: deliveryForm.seller_name, seller_location: deliveryForm.seller_location,
      seller_address: deliveryForm.seller_address, seller_whatsapp: deliveryForm.seller_whatsapp,
      seller_email: deliveryForm.seller_email, seller_website: deliveryForm.seller_website,
      seller_note: deliveryForm.seller_note, offers_refund: deliveryForm.offers_refund,
      invoice_url: deliveryForm.invoice_url,
      customer_name: deliveryForm.customer_name, customer_location: deliveryForm.customer_location,
      customer_address: deliveryForm.customer_address, customer_phone: deliveryForm.customer_phone,
      customer_email: deliveryForm.customer_email
    } as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    
    // Notify buyer
    if (deliveryForm.buyer_id) {
      await supabase.from('user_notifications').insert({
        user_id: deliveryForm.buyer_id, title: '🚚 Delivery Update',
        message: method === 'self' ? 'Seller will deliver your product directly.' : 'Your product will be picked up within 48 hours.',
        type: 'system', notification_category: 'delivery'
      });
    }
    toast({ title: 'Delivery submitted!', description: method === 'savemore' ? 'Product will be picked up within 48 hours.' : 'Customer has been notified.' });
    setDeliveryForm(null); fetchDeliveries();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    if (files.length + productImages.length > 5) { toast({ title: 'Max 5 images', variant: 'destructive' }); return; }
    setProductImages(prev => [...prev, ...files]);
  };

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  // Seller guide gate
  if (showGuide) {
    return (
      <div className="p-4 max-w-2xl mx-auto pb-20">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> Seller Guide</CardTitle></CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            {SELLER_GUIDE.split('\n').map((line, i) => {
              if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-4">{line.replace('## ', '')}</h2>;
              if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold mt-3">{line.replace(/\*\*/g, '')}</p>;
              if (line.startsWith('- ')) return <p key={i} className="ml-4 text-sm">{line.replace('- ', '• ')}</p>;
              if (line.match(/^\d+\./)) return <p key={i} className="ml-4 text-sm">{line}</p>;
              return line ? <p key={i} className="text-sm text-muted-foreground">{line}</p> : null;
            })}
            <Button className="w-full mt-6" onClick={() => setShowGuide(false)}>Continue to Marketplace →</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Product detail view
  if (selectedProduct) {
    return (
      <div className="p-4 max-w-3xl mx-auto pb-20">
        <Button variant="ghost" onClick={() => setSelectedProduct(null)} className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        <Card>
          <CardContent className="p-0">
            {/* Images */}
            {selectedProduct.images?.length > 0 ? (
              <div>
                <div className="h-72 overflow-hidden"><img src={selectedProduct.images[selectedImageIdx]} alt="" className="w-full h-full object-cover" /></div>
                {selectedProduct.images.length > 1 && (
                  <div className="flex gap-2 p-3 overflow-x-auto">
                    {selectedProduct.images.map((img, i) => (
                      <img key={i} src={img} alt="" className={`w-16 h-16 object-cover rounded cursor-pointer border-2 ${i === selectedImageIdx ? 'border-primary' : 'border-transparent'}`} onClick={() => setSelectedImageIdx(i)} />
                    ))}
                  </div>
                )}
              </div>
            ) : <div className="h-48 bg-muted flex items-center justify-center"><Package className="w-12 h-12 text-muted-foreground" /></div>}
            
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold">{selectedProduct.title}</h1>
                  <div className="flex items-center gap-2 mt-1 cursor-pointer" onClick={() => navigate(`/profile/${selectedProduct.seller_user_id}`)}>
                    <Avatar className="w-6 h-6"><AvatarImage src={selectedProduct.user_profiles?.avatar_url} /><AvatarFallback>{selectedProduct.user_profiles?.username?.[0]}</AvatarFallback></Avatar>
                    <span className="text-sm text-muted-foreground">{selectedProduct.user_profiles?.username}</span>
                    {selectedProduct.user_profiles?.vip && <Crown className="w-3 h-3 text-yellow-500" />}
                  </div>
                </div>
                <span className="text-2xl font-bold text-primary">₦{selectedProduct.price_ngn.toLocaleString()}</span>
              </div>

              <p className="text-sm">{selectedProduct.description}</p>
              
              <div className="flex gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">Stock: {selectedProduct.stock}</Badge>
                {selectedProduct.delivery_options && <Badge variant="outline">{selectedProduct.delivery_options}</Badge>}
                {avgRating && <Badge variant="secondary">⭐ {avgRating} ({reviews.length})</Badge>}
              </div>

              {selectedProduct.seller_contact && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate('/chat', { state: { recipientId: selectedProduct.seller_user_id } })}>
                    <MessageCircle className="w-4 h-4 mr-1" /> Chat Seller
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => buyProduct(selectedProduct)} disabled={selectedProduct.stock === 0}>{selectedProduct.stock === 0 ? 'Out of Stock' : 'Buy Now'}</Button>
                <Button variant="outline" size="icon" onClick={() => copyLink(selectedProduct)}><Copy className="w-4 h-4" /></Button>
                <Button variant="outline" size="icon" onClick={() => shareProduct(selectedProduct)}><Share2 className="w-4 h-4" /></Button>
              </div>

              {/* Reviews */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Reviews ({reviews.length})</h3>
                {user && (
                  <div className="space-y-2 mb-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} onClick={() => setNewReview(p => ({...p, rating: s}))} className={`text-lg ${s <= newReview.rating ? 'text-yellow-500' : 'text-muted-foreground'}`}>★</button>
                      ))}
                    </div>
                    <Textarea placeholder="Write your review..." value={newReview.text} onChange={e => setNewReview(p => ({...p, text: e.target.value}))} rows={2} />
                    <Button size="sm" onClick={submitReview} disabled={!newReview.text.trim()}>Submit Review</Button>
                  </div>
                )}
                <div className="space-y-3">
                  {reviews.map(r => (
                    <div key={r.id} className="flex gap-3 p-2">
                      <Avatar className="w-8 h-8 cursor-pointer" onClick={() => navigate(`/profile/${r.user_id}`)}>
                        <AvatarImage src={r.profile?.avatar_url} /><AvatarFallback>{r.profile?.username?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{r.profile?.username}</span>
                          <span className="text-xs text-yellow-500">{'★'.repeat(r.rating)}</span>
                          <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{r.review}</p>
                      </div>
                    </div>
                  ))}
                  {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Delivery form dialog
  const renderDeliveryDialog = () => {
    if (!deliveryForm) return null;
    return (
      <Dialog open={!!deliveryForm} onOpenChange={() => setDeliveryForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Choose Delivery Method</DialogTitle></DialogHeader>
          <Tabs defaultValue="self">
            <TabsList className="w-full"><TabsTrigger value="self" className="flex-1">🚚 Self Delivery</TabsTrigger><TabsTrigger value="savemore" className="flex-1">🚚 Lenory Express (50⭐)</TabsTrigger></TabsList>
            <TabsContent value="self" className="space-y-3">
              <Input placeholder="Your Name" value={deliveryForm.seller_name || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_name: e.target.value})} />
              <Input placeholder="Location (State, Country)" value={deliveryForm.seller_location || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_location: e.target.value})} />
              <Input placeholder="Address" value={deliveryForm.seller_address || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_address: e.target.value})} />
              <Input placeholder="WhatsApp Number" value={deliveryForm.seller_whatsapp || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_whatsapp: e.target.value})} />
              <Input placeholder="Email" value={deliveryForm.seller_email || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_email: e.target.value})} />
              <Input placeholder="Website (optional)" value={deliveryForm.seller_website || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_website: e.target.value})} />
              <div className="flex items-center gap-2">
                <Checkbox checked={deliveryForm.offers_refund || false} onCheckedChange={c => setDeliveryForm({...deliveryForm, offers_refund: !!c})} />
                <span className="text-sm">I offer refunds</span>
              </div>
              <Textarea placeholder="Short note to customer" value={deliveryForm.seller_note || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_note: e.target.value})} rows={2} />
              <Button className="w-full" onClick={() => submitDeliveryForm('self')}><Send className="w-4 h-4 mr-2" /> Send to Customer</Button>
            </TabsContent>
            <TabsContent value="savemore" className="space-y-3">
              <Input placeholder="Your Full Name" value={deliveryForm.seller_name || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_name: e.target.value})} />
              <Input placeholder="Pickup Location (State, Country)" value={deliveryForm.seller_location || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_location: e.target.value})} />
              <Input placeholder="Pickup Address" value={deliveryForm.seller_address || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_address: e.target.value})} />
              <Input placeholder="WhatsApp / Phone" value={deliveryForm.seller_whatsapp || ''} onChange={e => setDeliveryForm({...deliveryForm, seller_whatsapp: e.target.value})} />
              <p className="text-xs text-muted-foreground">Customer info auto-filled from Bought Products:</p>
              <Input placeholder="Customer Name" value={deliveryForm.customer_name || ''} onChange={e => setDeliveryForm({...deliveryForm, customer_name: e.target.value})} />
              <Input placeholder="Customer Address" value={deliveryForm.customer_address || ''} onChange={e => setDeliveryForm({...deliveryForm, customer_address: e.target.value})} />
              <Input placeholder="Customer Phone" value={deliveryForm.customer_phone || ''} onChange={e => setDeliveryForm({...deliveryForm, customer_phone: e.target.value})} />
              <p className="text-xs font-medium text-destructive">50 Stars will be deducted for Lenory Express delivery</p>
              <Button className="w-full" onClick={() => submitDeliveryForm('savemore')}><Truck className="w-4 h-4 mr-2" /> Submit for Pickup (50⭐)</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  };

  const filteredProducts = products.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6 pb-20">
      {renderDeliveryDialog()}
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center"><ShoppingBag className="w-6 h-6 mr-2" /> Marketplace</h1>
          <p className="text-muted-foreground text-sm">Buy and sell products</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGuide(true)}>Seller Guide</Button>
          {userProfile?.vip && (
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> List Product</Button></DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>List New Product</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Input placeholder="Product Title *" value={newProduct.title} onChange={e => setNewProduct(p => ({...p, title: e.target.value}))} />
                  <Textarea placeholder="Description *" value={newProduct.description} onChange={e => setNewProduct(p => ({...p, description: e.target.value}))} rows={3} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input type="number" placeholder="Price (₦) *" value={newProduct.price} onChange={e => setNewProduct(p => ({...p, price: e.target.value}))} />
                    <Input type="number" placeholder="Stock" value={newProduct.stock} onChange={e => setNewProduct(p => ({...p, stock: e.target.value}))} />
                  </div>
                  <Input placeholder="Delivery options" value={newProduct.delivery_options} onChange={e => setNewProduct(p => ({...p, delivery_options: e.target.value}))} />
                  <Input placeholder="Contact (phone/WhatsApp)" value={newProduct.seller_contact} onChange={e => setNewProduct(p => ({...p, seller_contact: e.target.value}))} />
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                    <label className="cursor-pointer text-sm text-primary hover:underline">Upload images (max 5)
                      <input type="file" multiple accept="image/*" onChange={handleImageChange} className="hidden" />
                    </label>
                    {productImages.length > 0 && <p className="text-xs text-muted-foreground mt-1">{productImages.length} selected</p>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                    <Button onClick={createProduct}>List Product</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
      </div>

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); if (v === 'bought') fetchDeliveries(); }}>
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          {userProfile?.vip && <TabsTrigger value="my-listings">My Listings ({myProducts.length})</TabsTrigger>}
          {userProfile?.vip && <TabsTrigger value="bought">Bought Products</TabsTrigger>}
        </TabsList>

        <TabsContent value="browse">
          {loading ? <div className="text-center py-12 text-muted-foreground">Loading...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map(p => (
                <Card key={p.id} className="hover:shadow-lg transition-shadow overflow-hidden cursor-pointer" onClick={() => openProductDetail(p)}>
                  {p.images?.length > 0 ? (
                    <div className="h-44 overflow-hidden"><img src={p.images[0]} alt={p.title} className="w-full h-full object-cover hover:scale-105 transition-transform" /></div>
                  ) : <div className="h-44 bg-muted flex items-center justify-center"><Package className="w-10 h-10 text-muted-foreground" /></div>}
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold line-clamp-1">{p.title}</h3>
                      {p.featured && <Star className="w-4 h-4 text-yellow-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-5 h-5"><AvatarImage src={p.user_profiles?.avatar_url} /><AvatarFallback className="text-[10px]">{p.user_profiles?.username?.[0]}</AvatarFallback></Avatar>
                      <span className="text-xs text-muted-foreground">{p.user_profiles?.username}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-primary">₦{p.price_ngn.toLocaleString()}</span>
                      <Button size="sm" onClick={e => { e.stopPropagation(); buyProduct(p); }} disabled={p.stock === 0}>{p.stock === 0 ? 'Sold' : 'Buy'}</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {!loading && filteredProducts.length === 0 && (
            <div className="text-center py-12"><ShoppingBag className="w-10 h-10 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">No products found</p></div>
          )}
        </TabsContent>

        {userProfile?.vip && (
          <TabsContent value="my-listings">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myProducts.map(p => (
                <Card key={p.id}>
                  {p.images?.length > 0 && <div className="h-28 overflow-hidden"><img src={p.images[0]} alt="" className="w-full h-full object-cover" /></div>}
                  <CardContent className="p-3 space-y-2">
                    <h3 className="font-semibold">{p.title}</h3>
                    <div className="flex justify-between items-center">
                      <span className="font-bold">₦{p.price_ngn.toLocaleString()}</span>
                      <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditingProduct(p); setShowEditDialog(true); }}><Edit2 className="w-3 h-3 mr-1" /> Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => copyLink(p)}><Copy className="w-3 h-3" /></Button>
                      <Button variant="outline" size="sm" onClick={() => shareProduct(p)}><Share2 className="w-3 h-3" /></Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteProduct(p.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {myProducts.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground">No listings yet</div>}
            </div>
          </TabsContent>
        )}

        {userProfile?.vip && (
          <TabsContent value="bought">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Customer details for your sold products (updated by admin)</p>
              {deliveries.length > 0 ? deliveries.map(d => (
                <Card key={d.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold">Order</h3>
                      <Badge variant={d.status === 'delivered' ? 'default' : d.status === 'on_the_way' ? 'secondary' : 'outline'}>{d.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Customer:</span> {d.customer_name}</div>
                      <div><span className="text-muted-foreground">Location:</span> {d.customer_location}</div>
                      <div><span className="text-muted-foreground">Address:</span> {d.customer_address}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {d.customer_phone}</div>
                      <div><span className="text-muted-foreground">Email:</span> {d.customer_email}</div>
                      <div><span className="text-muted-foreground">Deliver by:</span> {d.delivery_date}</div>
                      <div><span className="text-muted-foreground">Paid:</span> ₦{d.amount_paid}</div>
                      <div><span className="text-muted-foreground">Charged:</span> ₦{d.amount_charged}</div>
                    </div>
                    {d.status === 'pending' && (
                      <Button size="sm" onClick={() => setDeliveryForm({ product_id: d.product_id, buyer_id: d.buyer_id, customer_name: d.customer_name, customer_location: d.customer_location, customer_address: d.customer_address, customer_phone: d.customer_phone, customer_email: d.customer_email })}>
                        <Truck className="w-4 h-4 mr-1" /> Choose Delivery
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )) : <div className="text-center py-12 text-muted-foreground">No bought products yet. Admin will update this when customers buy.</div>}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          {editingProduct && (
            <div className="space-y-3">
              <Input value={editingProduct.title} onChange={e => setEditingProduct({...editingProduct, title: e.target.value})} placeholder="Title" />
              <Textarea value={editingProduct.description} onChange={e => setEditingProduct({...editingProduct, description: e.target.value})} rows={3} />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" value={editingProduct.price_ngn} onChange={e => setEditingProduct({...editingProduct, price_ngn: parseFloat(e.target.value)})} />
                <Input type="number" value={editingProduct.stock} onChange={e => setEditingProduct({...editingProduct, stock: parseInt(e.target.value)})} />
              </div>
              <Input value={editingProduct.delivery_options || ''} onChange={e => setEditingProduct({...editingProduct, delivery_options: e.target.value})} placeholder="Delivery options" />
              <Input value={editingProduct.seller_contact || ''} onChange={e => setEditingProduct({...editingProduct, seller_contact: e.target.value})} placeholder="Contact (leave empty to hide)" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button onClick={updateProduct}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;

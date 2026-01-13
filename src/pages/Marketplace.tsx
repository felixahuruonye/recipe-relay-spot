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
import { Plus, ShoppingBag, Star, Crown, Package, Search, Upload, Edit2, Trash2, Eye, MousePointer, Copy, Share2 } from 'lucide-react';
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
  user_profiles?: {
    username: string;
    avatar_url: string;
    vip: boolean;
  };
}

const Marketplace = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productAnalytics, setProductAnalytics] = useState<Record<string, { views: number; clicks: number }>>({});
  const [paymentUrls, setPaymentUrls] = useState<Record<string, string>>({});
  const [newProduct, setNewProduct] = useState({
    title: '',
    description: '',
    price: '',
    stock: '',
    delivery_options: '',
    seller_contact: ''
  });
  const [productImages, setProductImages] = useState<File[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchProducts();
      fetchMyProducts();
      fetchPaymentUrls();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchPaymentUrls = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_key, setting_value')
      .like('setting_key', 'product_payment_url_%');

    const urls: Record<string, string> = {};
    data?.forEach(item => {
      const productId = item.setting_key.replace('product_payment_url_', '');
      urls[productId] = item.setting_value || '';
    });
    setPaymentUrls(urls);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(data?.map(p => p.seller_user_id) || [])];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, vip')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]));

    const productsWithProfiles = (data || []).map(product => ({
      ...product,
      user_profiles: profileMap.get(product.seller_user_id)
    }));

    setProducts(productsWithProfiles);
    setLoading(false);

    const channel = supabase
      .channel('products-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts();
        fetchMyProducts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const fetchMyProducts = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyProducts(data || []);

      // Fetch analytics for my products
      const analytics: Record<string, { views: number; clicks: number }> = {};
      for (const product of data || []) {
        // Get view count from post_views or a dedicated table
        const { count: viewCount } = await supabase
          .from('post_views')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', product.id);

        analytics[product.id] = {
          views: viewCount || 0,
          clicks: 0 // Would need a dedicated click tracking table
        };
      }
      setProductAnalytics(analytics);
    } catch (error) {
      console.error('Error fetching my products:', error);
    }
  };

  const uploadProductImages = async (): Promise<string[]> => {
    if (!productImages.length || !user) return [];

    const uploadPromises = productImages.map(async (file, index) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/products/${Date.now()}-${index}.${fileExt}`;

      const { error } = await supabase.storage
        .from('post-media')
        .upload(fileName, file);

      if (error) {
        console.error('Product image upload error:', error);
        return null;
      }

      const { data } = supabase.storage
        .from('post-media')
        .getPublicUrl(fileName);

      return data.publicUrl;
    });

    const results = await Promise.all(uploadPromises);
    return results.filter((url): url is string => url !== null);
  };

  const createProduct = async () => {
    if (!user || !userProfile?.vip) {
      toast({
        title: "VIP Required",
        description: "Only VIP members can list products on the marketplace",
        variant: "destructive"
      });
      return;
    }

    if (!newProduct.title || !newProduct.description || !newProduct.price) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const imageUrls = await uploadProductImages();

      const { error } = await supabase
        .from('products')
        .insert({
          seller_user_id: user.id,
          title: newProduct.title.trim(),
          description: newProduct.description.trim(),
          price_ngn: parseFloat(newProduct.price),
          stock: parseInt(newProduct.stock) || 1,
          delivery_options: newProduct.delivery_options.trim(),
          seller_contact: newProduct.seller_contact.trim(),
          images: imageUrls,
          status: 'active'
        });

      if (error) throw error;

      toast({
        title: "Product listed!",
        description: "Your product has been added to the marketplace"
      });

      setNewProduct({
        title: '',
        description: '',
        price: '',
        stock: '',
        delivery_options: '',
        seller_contact: ''
      });
      setProductImages([]);
      setShowCreateDialog(false);
      
      fetchProducts();
      fetchMyProducts();
    } catch (error) {
      console.error('Error creating product:', error);
      toast({
        title: "Error",
        description: "Failed to create product listing",
        variant: "destructive"
      });
    }
  };

  const updateProduct = async () => {
    if (!editingProduct) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({
          title: editingProduct.title,
          description: editingProduct.description,
          price_ngn: editingProduct.price_ngn,
          stock: editingProduct.stock,
          delivery_options: editingProduct.delivery_options,
          seller_contact: editingProduct.seller_contact
        })
        .eq('id', editingProduct.id);

      if (error) throw error;

      toast({
        title: "Product updated!",
        description: "Your changes have been saved"
      });

      setShowEditDialog(false);
      setEditingProduct(null);
      fetchMyProducts();
    } catch (error) {
      console.error('Error updating product:', error);
      toast({
        title: "Error",
        description: "Failed to update product",
        variant: "destructive"
      });
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: "Product deleted",
        description: "Your product has been removed from the marketplace"
      });

      fetchMyProducts();
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: "Error",
        description: "Failed to delete product",
        variant: "destructive"
      });
    }
  };

  const buyProduct = (product: Product) => {
    // Check if there's a custom payment URL set by admin
    const customUrl = paymentUrls[product.id];
    if (customUrl) {
      window.open(customUrl, '_blank');
      return;
    }

    // Default behavior
    const metadata = `user_id:${user?.id}|product_id:${product.id}`;
    const paystackUrl = `https://paystack.com/pay/product-purchase?metadata=${encodeURIComponent(metadata)}&amount=${product.price_ngn * 100}`;
    window.open(paystackUrl, '_blank');
  };

  const copyProductLink = (product: Product) => {
    const link = `${window.location.origin}/marketplace?product=${product.id}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copied!",
      description: "Product link copied to clipboard"
    });
  };

  const shareProduct = (product: Product) => {
    const link = `${window.location.origin}/marketplace?product=${product.id}`;
    const text = `🛒 Check out "${product.title}" on SaveMore Community!\n💰 ₦${product.price_ngn.toLocaleString()}\n\n${link}`;
    
    if (navigator.share) {
      navigator.share({
        title: product.title,
        text: `${product.description.slice(0, 100)}...`,
        url: link
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} is larger than 5MB`,
          variant: "destructive"
        });
        return false;
      }
      return file.type.startsWith('image/');
    });

    if (validFiles.length + productImages.length > 5) {
      toast({
        title: "Too many images",
        description: "You can upload up to 5 images per product",
        variant: "destructive"
      });
      return;
    }

    setProductImages(prev => [...prev, ...validFiles]);
  };

  const filteredProducts = products.filter(product =>
    product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <ShoppingBag className="w-6 h-6 mr-2" />
            Marketplace
          </h1>
          <p className="text-muted-foreground">Buy and sell products</p>
        </div>
        
        {userProfile?.vip ? (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                List Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>List New Product</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Product Title *</label>
                  <Input
                    placeholder="What are you selling?"
                    value={newProduct.title}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, title: e.target.value }))}
                    maxLength={100}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Description *</label>
                  <Textarea
                    placeholder="Describe your product in detail..."
                    value={newProduct.description}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                    maxLength={500}
                    rows={4}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Price (₦) *</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={newProduct.price}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, price: e.target.value }))}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Stock Quantity</label>
                    <Input
                      type="number"
                      placeholder="1"
                      value={newProduct.stock}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, stock: e.target.value }))}
                      min="1"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Delivery Options</label>
                  <Input
                    placeholder="e.g., Pickup, Lagos delivery, Nationwide shipping"
                    value={newProduct.delivery_options}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, delivery_options: e.target.value }))}
                    maxLength={100}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Contact Information</label>
                  <Input
                    placeholder="Phone number or WhatsApp"
                    value={newProduct.seller_contact}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, seller_contact: e.target.value }))}
                    maxLength={50}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Product Images</label>
                  <div className="border-2 border-dashed border-border rounded-lg p-4">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <label className="cursor-pointer">
                        <span className="text-sm font-medium text-primary hover:underline">
                          Upload product images
                        </span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Up to 5 images, 5MB each
                      </p>
                    </div>
                  </div>
                  {productImages.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {productImages.length} image(s) selected
                    </p>
                  )}
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createProduct}>
                    List Product
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <Crown className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
            <p className="text-sm font-medium">VIP Required</p>
            <p className="text-xs text-muted-foreground">Only VIP members can sell on the marketplace</p>
            <Button size="sm" className="mt-2" onClick={() => window.location.href = '/vip-subscription'}>
              Upgrade to VIP
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse">Browse Products</TabsTrigger>
          {userProfile?.vip && (
            <TabsTrigger value="my-listings">My Listings ({myProducts.length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="browse">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <div className="h-48 bg-muted rounded-t-lg"></div>
                  <CardHeader>
                    <div className="h-6 bg-muted rounded"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-20 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                  {product.images && product.images.length > 0 ? (
                    <div className="h-48 overflow-hidden">
                      <img 
                        src={product.images[0]} 
                        alt={product.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </div>
                  ) : (
                    <div className="h-48 bg-muted flex items-center justify-center">
                      <Package className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg line-clamp-2">{product.title}</CardTitle>
                      {product.featured && (
                        <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={product.user_profiles?.avatar_url} />
                        <AvatarFallback className="text-xs">
                          {product.user_profiles?.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">
                        {product.user_profiles?.username}
                      </span>
                      {product.user_profiles?.vip && (
                        <Crown className="w-3 h-3 text-yellow-500" />
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {product.description}
                    </p>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold text-primary">₦{product.price_ngn.toLocaleString()}</span>
                        <Badge variant="outline">
                          Stock: {product.stock}
                        </Badge>
                      </div>
                      
                      {product.delivery_options && (
                        <p className="text-xs text-muted-foreground">
                          Delivery: {product.delivery_options}
                        </p>
                      )}
                    </div>
                    
                    <Button 
                      className="w-full" 
                      onClick={() => buyProduct(product)}
                      disabled={product.stock === 0}
                    >
                      {product.stock === 0 ? 'Out of Stock' : 'Buy Now'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No products found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search terms' : 'Be the first to list a product!'}
              </p>
            </div>
          )}
        </TabsContent>

        {userProfile?.vip && (
          <TabsContent value="my-listings">
            {myProducts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myProducts.map((product) => (
                  <Card key={product.id} className="hover:shadow-lg transition-shadow">
                    {product.images && product.images.length > 0 ? (
                      <div className="h-32 overflow-hidden">
                        <img 
                          src={product.images[0]} 
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : null}
                    <CardHeader>
                      <CardTitle className="text-lg line-clamp-2">{product.title}</CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          {productAnalytics[product.id]?.views || 0} views
                        </div>
                        <div className="flex items-center gap-1">
                          <MousePointer className="w-4 h-4" />
                          {productAnalytics[product.id]?.clicks || 0} clicks
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {product.description}
                      </p>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-bold">₦{product.price_ngn.toLocaleString()}</span>
                        <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                          {product.status}
                        </Badge>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setEditingProduct(product);
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyProductLink(product)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => shareProduct(product)}
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => deleteProduct(product.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No listings yet</h3>
                <p className="text-muted-foreground">Create your first product listing to get started!</p>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Product Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Product Title</label>
                <Input
                  value={editingProduct.title}
                  onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editingProduct.description}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Price (₦)</label>
                  <Input
                    type="number"
                    value={editingProduct.price_ngn}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price_ngn: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Stock</label>
                  <Input
                    type="number"
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Delivery Options</label>
                <Input
                  value={editingProduct.delivery_options || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, delivery_options: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Contact</label>
                <Input
                  value={editingProduct.seller_contact || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, seller_contact: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button onClick={updateProduct}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;
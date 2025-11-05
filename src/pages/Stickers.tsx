import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Upload, Star, TrendingUp, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Sticker {
  id: string;
  creator_id: string;
  title: string;
  image_url: string;
  tags: string[];
  star_price: number;
  usage_count: number;
  is_featured: boolean;
  status: string;
  created_at: string;
}

const Stickers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [myStickers, setMyStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newStickerTitle, setNewStickerTitle] = useState('');
  const [newStickerPrice, setNewStickerPrice] = useState(0);
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [stickerPreview, setStickerPreview] = useState('');

  useEffect(() => {
    fetchStickers();
    if (user) fetchMyStickers();
  }, [user]);

  const fetchStickers = async () => {
    try {
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .eq('status', 'active')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      setStickers(data || []);
    } catch (error) {
      console.error('Error fetching stickers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyStickers = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyStickers(data || []);
    } catch (error) {
      console.error('Error fetching my stickers:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Sticker must be less than 2MB',
        variant: 'destructive'
      });
      return;
    }

    setStickerFile(file);
    setStickerPreview(URL.createObjectURL(file));
  };

  const createSticker = async () => {
    if (!user || !stickerFile || !newStickerTitle) {
      toast({ title: 'Missing Information', description: 'Please add title and image', variant: 'destructive' });
      return;
    }

    try {
      const fileExt = stickerFile.name.split('.').pop();
      const fileName = `${user.id}/stickers/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(fileName, stickerFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-media')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('stickers')
        .insert({
          creator_id: user.id,
          title: newStickerTitle,
          image_url: publicUrl,
          star_price: newStickerPrice,
          tags: []
        });

      if (insertError) throw insertError;

      toast({ title: 'Success!', description: 'Sticker created successfully' });
      setShowCreateDialog(false);
      setNewStickerTitle('');
      setNewStickerPrice(0);
      setStickerFile(null);
      setStickerPreview('');
      fetchStickers();
      fetchMyStickers();
    } catch (error) {
      console.error('Error creating sticker:', error);
      toast({ title: 'Error', description: 'Failed to create sticker', variant: 'destructive' });
    }
  };

  const featuredStickers = stickers.filter(s => s.is_featured);
  const trendingStickers = stickers.slice(0, 20);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Stickers</h1>
          <p className="text-muted-foreground">Create and use custom stickers in your stories</p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Sticker
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Sticker</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Sticker Title</label>
                <Input
                  value={newStickerTitle}
                  onChange={(e) => setNewStickerTitle(e.target.value)}
                  placeholder="Enter sticker name"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Upload Image (Max 2MB)</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="mt-1"
                />
                {stickerPreview && (
                  <img src={stickerPreview} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded" />
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Star Price (Optional)</label>
                <div className="flex gap-2 mt-2">
                  {[0, 5, 10, 20, 30, 50].map(price => (
                    <Button
                      key={price}
                      size="sm"
                      variant={newStickerPrice === price ? 'default' : 'outline'}
                      onClick={() => setNewStickerPrice(price)}
                    >
                      {price === 0 ? 'Free' : `${price}⭐`}
                    </Button>
                  ))}
                </div>
              </div>

              <Button onClick={createSticker} className="w-full">
                Create Sticker
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="trending">
        <TabsList>
          <TabsTrigger value="trending">
            <TrendingUp className="w-4 h-4 mr-2" />
            Trending
          </TabsTrigger>
          <TabsTrigger value="featured">
            <Sparkles className="w-4 h-4 mr-2" />
            Featured
          </TabsTrigger>
          <TabsTrigger value="my-stickers">My Stickers ({myStickers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="trending" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {trendingStickers.map((sticker) => (
              <Card key={sticker.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="p-4 text-center space-y-2">
                  <img src={sticker.image_url} alt={sticker.title} className="w-full h-20 object-contain" />
                  <p className="text-sm font-medium truncate">{sticker.title}</p>
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="secondary">{sticker.usage_count} uses</Badge>
                    {sticker.star_price > 0 && (
                      <Badge>{sticker.star_price}⭐</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="featured" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {featuredStickers.map((sticker) => (
              <Card key={sticker.id} className="hover:shadow-lg transition-shadow cursor-pointer border-primary">
                <CardContent className="p-4 text-center space-y-2">
                  <img src={sticker.image_url} alt={sticker.title} className="w-full h-20 object-contain" />
                  <p className="text-sm font-medium truncate">{sticker.title}</p>
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="secondary">{sticker.usage_count} uses</Badge>
                    {sticker.star_price > 0 && (
                      <Badge>{sticker.star_price}⭐</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="my-stickers" className="space-y-4">
          {myStickers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {myStickers.map((sticker) => (
                <Card key={sticker.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-4 text-center space-y-2">
                    <img src={sticker.image_url} alt={sticker.title} className="w-full h-20 object-contain" />
                    <p className="text-sm font-medium truncate">{sticker.title}</p>
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="secondary">{sticker.usage_count} uses</Badge>
                      {sticker.star_price > 0 && (
                        <Badge>{sticker.star_price}⭐</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">You haven't created any stickers yet</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Stickers;

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Image, Video, Star, ArrowLeft, ArrowRight, Check, Music, Hash, Sparkles, Eye, Coins } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import MusicBrowser from '@/components/Music/MusicBrowser';

interface CreatePostWizardProps {
  onPostCreated?: () => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  postToEdit?: any;
}

const STEPS = [
  { label: 'Media', icon: Image, desc: 'Upload your content' },
  { label: 'Context', icon: Hash, desc: 'Title & category' },
  { label: 'Canvas', icon: Sparkles, desc: 'Tags & caption' },
  { label: 'Vibe Sync', icon: Music, desc: 'Add music' },
  { label: 'Value', icon: Coins, desc: 'Set earnings' },
  { label: 'Launch', icon: Check, desc: 'Review & post' },
];

const categories = [
  'Wealth', 'Tech', 'Music', 'Lifestyle', 'Education',
  'Entertainment', 'Business', 'For Sale', 'General Discussion'
];

const starPriceOptions = [
  0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50,
  100, 200, 300, 500, 1000, 2000, 5000, 10000, 50000, 100000
];

const CreatePostWizard: React.FC<CreatePostWizardProps> = ({ onPostCreated, isOpen, onOpenChange, postToEdit }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1: Media
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');

  // Step 2: Context
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');

  // Step 3: Canvas
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Step 4: Vibe Sync (music placeholder)
  const [selectedMusic, setSelectedMusic] = useState<string>('');

  // Step 5: Value
  const [starPrice, setStarPrice] = useState(0);
  const [userStarBalance, setUserStarBalance] = useState(0);

  const isPaidTier = starPrice >= 100;
  const postingFee = isPaidTier ? 40 : 0;
  const canAffordFee = userStarBalance >= postingFee;

  const hasVideo = mediaFiles.some(f => f.type.startsWith('video/')) ||
    mediaPreviews.some(p => /\.(mp4|webm|ogg|mov)/i.test(p));

  useEffect(() => {
    if (user) loadBalance();
  }, [user]);

  useEffect(() => {
    if (postToEdit) {
      setTitle(postToEdit.title || '');
      setBody(postToEdit.body || '');
      setCategory(postToEdit.category || '');
      setMediaPreviews(postToEdit.media_urls || []);
      setStarPrice(postToEdit.star_price || 0);
      setThumbnailPreview(postToEdit.thumbnail_url || '');
    }
  }, [postToEdit]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      if (!postToEdit) {
        setMediaFiles([]); setMediaPreviews([]); setTitle(''); setBody('');
        setCategory(''); setTags([]); setTagInput(''); setStarPrice(0);
        setSelectedMusic(''); setThumbnailFile(null); setThumbnailPreview('');
      }
    }
  }, [isOpen]);

  const loadBalance = async () => {
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('star_balance').eq('id', user.id).single();
    setUserStarBalance(data?.star_balance || 0);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => {
      const maxSize = f.type.startsWith('video/') ? 500 * 1024 * 1024 : 20 * 1024 * 1024;
      if (f.size > maxSize) {
        toast({ title: 'File too large', description: `${f.name} exceeds limit`, variant: 'destructive' });
        return false;
      }
      return f.type.startsWith('image/') || f.type.startsWith('video/');
    });
    if (validFiles.length + mediaFiles.length > 3) {
      toast({ title: 'Max 3 files', variant: 'destructive' });
      return;
    }
    setMediaFiles(prev => [...prev, ...validFiles]);
    validFiles.forEach(f => setMediaPreviews(prev => [...prev, URL.createObjectURL(f)]));
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('image/')) {
      setThumbnailFile(f);
      setThumbnailPreview(URL.createObjectURL(f));
    }
  };

  const removeMedia = (i: number) => {
    URL.revokeObjectURL(mediaPreviews[i]);
    setMediaFiles(prev => prev.filter((_, idx) => idx !== i));
    setMediaPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  const uploadMedia = async (): Promise<string[]> => {
    if (!mediaFiles.length || !user) return mediaPreviews.filter(p => p.startsWith('http'));
    const results = await Promise.all(mediaFiles.map(async (file, i) => {
      const ext = file.name.split('.').pop();
      const name = `${user.id}/${Date.now()}-${i}.${ext}`;
      const { error } = await supabase.storage.from('post-media').upload(name, file);
      if (error) return null;
      return supabase.storage.from('post-media').getPublicUrl(name).data.publicUrl;
    }));
    return results.filter((u): u is string => !!u);
  };

  const uploadThumbnail = async (): Promise<string | null> => {
    if (!thumbnailFile || !user) return thumbnailPreview || null;
    const ext = thumbnailFile.name.split('.').pop();
    const name = `${user.id}/thumb-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-media').upload(name, thumbnailFile);
    if (error) return null;
    return supabase.storage.from('post-media').getPublicUrl(name).data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!user || !title.trim() || !body.trim() || !category) return;
    if (isPaidTier && !canAffordFee) {
      toast({ title: 'Insufficient Stars', description: `Need ${postingFee} Stars`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (isPaidTier && !postToEdit) {
        await supabase.from('user_profiles').update({ star_balance: userStarBalance - postingFee }).eq('id', user.id);
      }
      const mediaUrls = await uploadMedia();
      const thumbUrl = await uploadThumbnail();
      const bodyWithTags = tags.length > 0 ? `${body.trim()}\n\n${tags.map(t => `#${t}`).join(' ')}` : body.trim();

      if (postToEdit?.id) {
        await supabase.from('posts').update({
          title: title.trim(), body: bodyWithTags, category,
          media_urls: mediaUrls, star_price: starPrice, thumbnail_url: thumbUrl,
        }).eq('id', postToEdit.id);
        toast({ title: 'Post updated!' });
      } else {
        await supabase.from('posts').insert({
          title: title.trim(), body: bodyWithTags, category,
          media_urls: mediaUrls, user_id: user.id, status: 'approved',
          star_price: starPrice, post_status: 'new', thumbnail_url: thumbUrl,
        });
        toast({ title: '🎉 Post created!', description: isPaidTier ? `${postingFee} Stars deducted` : 'Your post is live!' });
      }

      onOpenChange?.(false);
      onPostCreated?.();
      loadBalance();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to create post', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return mediaPreviews.length > 0 || (postToEdit?.media_urls?.length > 0);
      case 1: return title.trim().length > 0 && !!category;
      case 2: return body.trim().length >= 10;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center">
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <label className="cursor-pointer">
              <span className="text-sm font-semibold text-primary hover:underline">
                Upload images or videos
              </span>
              <input type="file" multiple accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
            </label>
            <p className="text-xs text-muted-foreground mt-1">Max 3 files · Images 20MB · Videos 500MB</p>
          </div>
          {mediaPreviews.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {mediaPreviews.map((p, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden">
                  {mediaFiles[i]?.type.startsWith('video/') ? (
                    <video src={p} className="w-full h-28 object-cover" muted />
                  ) : (
                    <img src={p} alt="" className="w-full h-28 object-cover" />
                  )}
                  <button onClick={() => removeMedia(i)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-1 left-1">
                    {mediaFiles[i]?.type.startsWith('video/') ? <Video className="w-3.5 h-3.5 text-white" /> : <Image className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasVideo && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-xl">
              <Label className="text-xs font-semibold flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Video Thumbnail</Label>
              {thumbnailPreview ? (
                <div className="relative w-24 h-16 rounded-lg overflow-hidden">
                  <img src={thumbnailPreview} className="w-full h-full object-cover" />
                  <button onClick={() => { setThumbnailFile(null); setThumbnailPreview(''); }} className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <label className="cursor-pointer text-xs text-primary hover:underline">
                  Upload thumbnail or <span className="text-accent font-bold">Generate with AI ✨</span>
                  <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                </label>
              )}
            </div>
          )}
        </div>
      );
      case 1: return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What's your post about?" maxLength={100} />
          </div>
          <div className="space-y-2">
            <Label>Domain / Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select domain" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      case 2: return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Caption / Description *</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Share your thoughts..." minLength={10} maxLength={2000} rows={5} />
            <div className="text-xs text-muted-foreground text-right">{body.length}/2000</div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Tags</Label>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Add a tag"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} className="flex-1" />
              <Button type="button" size="sm" variant="outline" onClick={addTag}>Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tags.map(t => (
                  <Badge key={t} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => setTags(prev => prev.filter(x => x !== t))}>
                    #{t} <X className="w-3 h-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      );
      case 3: return (
        <div className="space-y-4 text-center py-6">
          <Music className="w-12 h-12 mx-auto text-primary/60" />
          <h3 className="font-bold text-base">Vibe Sync 🎵</h3>
          <p className="text-sm text-muted-foreground">Add background music to your post. Musicians earn 10% royalty from each view!</p>
          <div className="space-y-2">
            <Input value={selectedMusic} onChange={e => setSelectedMusic(e.target.value)} placeholder="Paste music link or search..." />
            <p className="text-xs text-muted-foreground">Music library coming soon. Skip this step for now.</p>
          </div>
        </div>
      );
      case 4: return (
        <div className="space-y-4">
          <Label className="flex items-center gap-2"><Star className="w-4 h-4 text-yellow-500" /> Set Star Price</Label>
          <Select value={starPrice.toString()} onValueChange={v => setStarPrice(parseInt(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {starPriceOptions.map(p => (
                <SelectItem key={p} value={p.toString()}>
                  {p === 0 ? 'Free' : `${p} Stars`}{p >= 100 ? ' (40⭐ fee)' : p > 0 ? ' (Free to post)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {starPrice > 0 && (
            <div className="p-3 bg-muted rounded-xl space-y-1.5 text-sm">
              <p className="font-semibold">💰 Viewers pay: ₦{(starPrice * 500).toLocaleString()}</p>
              <p className="text-primary">✅ You earn: ₦{(starPrice * 500 * 0.40).toLocaleString()} (40%)</p>
              <p className="text-muted-foreground">🎁 Viewer cashback: ₦{(starPrice * 500 * 0.35).toLocaleString()} (35%)</p>
              {selectedMusic && <p className="text-accent">🎵 Musician: ₦{(starPrice * 500 * 0.10).toLocaleString()} (10%)</p>}
              <p className="text-muted-foreground">🏢 Platform: 25%</p>
              {isPaidTier && (
                <p className={canAffordFee ? 'text-yellow-600 font-semibold' : 'text-destructive font-semibold'}>
                  ⭐ Posting fee: {postingFee} Stars {canAffordFee ? '✓' : `(Need ${postingFee}, have ${userStarBalance})`}
                </p>
              )}
            </div>
          )}
        </div>
      );
      case 5: return (
        <div className="space-y-4">
          <h3 className="font-bold text-base text-center">Review Your Post 🚀</h3>
          {mediaPreviews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {mediaPreviews.map((p, i) => (
                <img key={i} src={p} alt="" className="w-20 h-14 object-cover rounded-lg shrink-0" />
              ))}
            </div>
          )}
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Title:</span> <span className="font-medium">{title}</span></div>
            <div><span className="text-muted-foreground">Category:</span> <Badge variant="secondary">{category}</Badge></div>
            <div><span className="text-muted-foreground">Caption:</span> <span className="line-clamp-2">{body}</span></div>
            {tags.length > 0 && <div className="flex flex-wrap gap-1">{tags.map(t => <Badge key={t} variant="outline" className="text-xs">#{t}</Badge>)}</div>}
            <div><span className="text-muted-foreground">Star Price:</span> <span className="font-bold text-yellow-500">{starPrice === 0 ? 'Free' : `${starPrice} ⭐`}</span></div>
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Progress */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">{postToEdit ? 'Edit Post' : 'Create Post To Earn'}</h2>
            <span className="text-xs text-muted-foreground">{step + 1}/6</span>
          </div>
          <Progress value={((step + 1) / 6) * 100} className="h-1.5" />
          {/* Step indicators */}
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => i <= step && setStep(i)}
                className={`flex flex-col items-center gap-0.5 transition-colors ${i <= step ? 'text-primary' : 'text-muted-foreground/40'}`}
              >
                <s.icon className="w-3.5 h-3.5" />
                <span className="text-[9px] font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex gap-2 p-4 pt-2 border-t border-border/50">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}
          <div className="flex-1" />
          {step < 5 ? (
            <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="gap-1">
              Next <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={loading || (isPaidTier && !canAffordFee)}
              className="gap-1 bg-gradient-to-r from-primary to-accent text-primary-foreground">
              {loading ? 'Publishing...' : '🚀 Launch Post'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostWizard;

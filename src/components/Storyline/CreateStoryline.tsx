import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Upload, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StorySettings } from './StorySettings';
import MusicBrowser from '@/components/Music/MusicBrowser';

interface CreateStorylineProps {
  onCreated?: () => void;
  userProfile?: { username: string; avatar_url: string };
  autoOpen?: boolean;
  onCancel?: () => void;
}

export const CreateStoryline: React.FC<CreateStorylineProps> = ({ onCreated, userProfile, autoOpen = false, onCancel }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicPreview, setMusicPreview] = useState<string>('');
  const [selectedMusicTrack, setSelectedMusicTrack] = useState<any>(null);
  const [starPrice, setStarPrice] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const ensureMusicTrackId = async () => {
    if (!selectedMusicTrack) return null;
    if (!selectedMusicTrack.id?.startsWith('spotify-') && !selectedMusicTrack.id?.startsWith('yt-')) return selectedMusicTrack.id;
    const externalId = selectedMusicTrack.spotify_id || selectedMusicTrack.external_id || selectedMusicTrack.youtube_id;
    if (!externalId) return null;
    const { data: existing } = await supabase.from('music_tracks').select('id').eq('external_id', externalId).maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created } = await supabase.from('music_tracks').insert({
      title: selectedMusicTrack.title,
      artist_name: selectedMusicTrack.artist_name,
      cover_url: selectedMusicTrack.cover_url,
      duration_seconds: selectedMusicTrack.duration_seconds || 0,
      source: 'lenory_free',
      external_id: externalId,
      youtube_id: selectedMusicTrack.youtube_id,
      audio_url: '',
      status: 'active'
    }).select('id').single();
    return created?.id || null;
  };

  const handleCardClick = () => setOpen(true);

  const handleUploadClick = () => {
    setShowWelcome(false);
    setOpen(true);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: `File must be less than ${file.type.startsWith('video/') ? '100MB' : '10MB'}`,
        variant: 'destructive'
      });
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    if (file.type.startsWith('video/')) generateVideoThumbnail(file).then(result => {
      if (result) { setPreviewBlob(result.blob); setPreviewUrl(result.url); }
    });
  };

  const generateVideoThumbnail = (file: File): Promise<{ blob: Blob; url: string } | null> => new Promise(resolve => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => { video.currentTime = Math.min(0.35, Math.max(0, (video.duration || 1) - 0.1)); };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob ? { blob, url: URL.createObjectURL(blob) } : null); }, 'image/jpeg', 0.82);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });

  const handleSubmit = async () => {
    if (!user || !mediaFile) return;

    setLoading(true);
    try {
      const fileExt = mediaFile.name.split('.').pop();
      const fileName = `${user.id}/stories/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(fileName, mediaFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-media')
        .getPublicUrl(fileName);

      let previewUrl = publicUrl;
      const previewUpload = previewFile || previewBlob;
      if (previewUpload) {
        const previewExt = previewFile ? previewFile.name.split('.').pop() : 'jpg';
        const previewFileName = `${user.id}/stories/preview-${Date.now()}.${previewExt}`;

        const { error: previewError } = await supabase.storage
          .from('post-media')
          .upload(previewFileName, previewUpload);

        if (!previewError) {
          const { data: { publicUrl: previewPublicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(previewFileName);
          previewUrl = previewPublicUrl;
        }
      }

      let musicUrl = null;
      if (musicFile) {
        const musicExt = musicFile.name.split('.').pop();
        const musicFileName = `${user.id}/stories/music-${Date.now()}.${musicExt}`;

        const { error: musicError } = await supabase.storage
          .from('post-media')
          .upload(musicFileName, musicFile);

        if (!musicError) {
          const { data: { publicUrl: musicPublicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(musicFileName);
          musicUrl = musicPublicUrl;
        }
      }

      const musicTrackId = await ensureMusicTrackId();

      const { error: insertError } = await supabase
        .from('user_storylines')
        .insert({
          user_id: user.id,
          media_url: publicUrl,
          preview_url: previewUrl,
          music_url: selectedMusicTrack?.audio_url || musicUrl,
          music_track_id: musicTrackId,
          caption: caption,
          star_price: starPrice,
          media_type: mediaFile.type.startsWith('video/') ? 'video' : 'image'
        } as any);

      if (insertError) throw insertError;

      toast({ title: 'Success', description: 'Story created!' });
      setOpen(false);
      setMediaFile(null);
      setMediaPreview('');
      setCaption('');
      setPreviewFile(null);
      setPreviewBlob(null);
      setPreviewUrl('');
      setMusicFile(null);
      setSelectedMusicTrack(null);
      setStarPrice(0);
      if (onCreated) onCreated();
    } catch (error) {
      console.error('Error creating story:', error);
      toast({ title: 'Error', description: 'Failed to create story', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Auto-open the creation form when launched from the Storyline page.
  React.useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  return (
    <>
      {/* Story Card - Clickable to open welcome */}
      <div 
        onClick={handleCardClick}
        className="glass-card card-3d cursor-pointer p-6 rounded-2xl flex flex-col items-center gap-4 hover:neon-glow transition-all"
      >
        <Avatar className="h-20 w-20 border-4 border-primary/50">
          <AvatarImage src={userProfile?.avatar_url} />
          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
            {userProfile?.username?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-2 text-primary">
          <Plus className="h-10 w-10" />
          <span className="text-lg font-semibold">Create Story</span>
        </div>
      </div>

      {/* Welcome Message Dialog */}
      <Dialog open={showWelcome} onOpenChange={setShowWelcome}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-card">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center gradient-text">✨ Welcome to StarStory! ✨</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 text-sm">
            <Alert>
              <AlertDescription>
                <p className="font-semibold mb-2">Share your story, earn Stars, and inspire the world!</p>
                <p>Welcome to Lenory StarStory, the home of creative minds and premium stories.</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p>🌍 Here, every video, photo, or short story you post has real value — because your viewers pay in Stars to unlock your content.</p>
              <p>🪄 Set how many Stars ⭐ you want your viewers to pay (1–5⭐).</p>
              <p>💰 Each Star = ₦500 ($0.33 USD)</p>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-1">
              <p className="font-semibold">Example:</p>
              <p>1⭐ = ₦500 / $0.33</p>
              <p>2⭐ = ₦1,000 / $0.67</p>
              <p>3⭐ = ₦1,500 / $1.00</p>
              <p>4⭐ = ₦2,000 / $1.33</p>
              <p>5⭐ = ₦2,500 / $1.67</p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold">When a viewer unlocks your story:</p>
              <p>• You instantly earn 40% in your wallet 💼</p>
              <p>• The viewer receives 35% cashback as a thank-you bonus 🎁</p>
              <p>• The platform keeps 25% for smooth operation ⚙️</p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold">🌟 Tips for Uploaders:</p>
              <p>• Add attractive captions and Preview thumbnails to get more views.</p>
              <p>• Set a fair Star rate — higher Stars mean premium content.</p>
              <p>• The more views you get, the more you earn!</p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold">👀 Tips for Viewers:</p>
              <p>• Spend Stars to unlock exclusive stories.</p>
              <p>• Earn cashback instantly to your wallet.</p>
              <p>• Support creators you love and climb the leaderboard! 🏆</p>
            </div>

            <Button onClick={handleUploadClick} className="w-full" size="lg">
              <Upload className="mr-2 h-5 w-5" />
              Upload Story Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass-card">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="gradient-text">Create Story</DialogTitle>
            <StorySettings />
          </DialogHeader>

          <div className="space-y-4">
            {/* Media Upload */}
            <div>
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={handleMediaChange}
                className="hidden"
                id="story-media"
              />
              <label htmlFor="story-media">
                <Button variant="outline" className="w-full" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo/Video
                  </span>
                </Button>
              </label>

              {mediaPreview && (
                <div className="mt-4">
                  {mediaFile?.type.startsWith('video/') ? (
                    <video src={mediaPreview} controls className="w-full rounded-lg max-h-60" />
                  ) : (
                    <img src={mediaPreview} alt="Preview" className="w-full rounded-lg max-h-60 object-cover" />
                  )}
                </div>
              )}
              {previewUrl && <img src={previewUrl} alt="Generated thumbnail" className="mt-2 h-20 w-20 rounded-lg object-cover" />}
            </div>

            {/* Caption */}
            <Textarea
              placeholder="Add a caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
            />

            {/* Preview Image */}
            <div>
              <label className="text-sm font-medium">Preview Thumbnail (Optional)</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { setPreviewFile(file); setPreviewUrl(URL.createObjectURL(file)); }
                }}
                className="mt-1"
              />
            </div>

            {/* Music */}
            <div>
              <label className="text-sm font-medium">Add Music (Optional)</label>
              <MusicBrowser selectedTrackId={selectedMusicTrack?.id} onSelect={setSelectedMusicTrack} />
              <Input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setMusicFile(file);
                    setMusicPreview(URL.createObjectURL(file));
                  }
                }}
                className="mt-1"
              />
              {musicPreview && (
                <div className="mt-2 glass-card p-3 rounded-lg">
                  <audio ref={audioRef} src={musicPreview} controls className="w-full" />
                </div>
              )}
            </div>

            {/* Star Price Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Set Star Price (Optional)</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <Button
                  variant={starPrice === 0 ? "default" : "outline"}
                  onClick={() => setStarPrice(0)}
                  className="btn-3d"
                >
                  Free
                </Button>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <Button
                    key={stars}
                    variant={starPrice === stars ? "default" : "outline"}
                    onClick={() => setStarPrice(stars)}
                    className="btn-3d"
                  >
                    {stars}<Star className="h-3 w-3 ml-1 fill-current" />
                  </Button>
                ))}
              </div>
              {starPrice > 0 && (
                <div className="glass-card p-3 mt-2 space-y-1">
                  <p className="text-xs font-semibold">
                    💰 Viewers pay: ₦{starPrice * 500} (${(starPrice * 0.33).toFixed(2)})
                  </p>
                  <p className="text-xs text-primary">
                    ✅ You earn: ₦{starPrice * 500 * 0.4} (40%)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    🎁 Viewer gets: ₦{starPrice * 500 * 0.35} cashback (35%)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ⚙️ Platform fee: ₦{starPrice * 500 * 0.25} (25%)
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={!mediaFile || loading}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Share Story'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ArrowLeft, Music, Sparkles, Upload, Camera, RefreshCw, BookOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface CreatePostWizardProps {
  onPostCreated?: () => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  postToEdit?: any;
  preselectedTrack?: any;
}

const categories = [
  'Wealth', 'Tech', 'Music', 'Lifestyle', 'Education',
  'Entertainment', 'Business', 'For Sale', 'General Discussion'
];

const CreatePostWizard: React.FC<CreatePostWizardProps> = ({
  onPostCreated, isOpen, onOpenChange, postToEdit, preselectedTrack
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Media
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  // Details
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');

  // Vibe Sync
  const [selectedMusicTrack, setSelectedMusicTrack] = useState<any>(null);
  const [musicStart, setMusicStart] = useState(0);
  const [musicDuration, setMusicDuration] = useState(15);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [communityTracks, setCommunityTracks] = useState<any[]>([]);
  const [aiPickedTrack, setAiPickedTrack] = useState<any>(null);

  // Storyline
  const [alsoPostToStoryline, setAlsoPostToStoryline] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      if (!postToEdit) {
        setMediaFiles([]); setMediaPreviews([]); setTitle(''); setBody('');
        setCategory(''); setSelectedMusicTrack(null); setThumbnailFile(null);
        setThumbnailBlob(null); setThumbnailPreview('');
        setMusicStart(0); setMusicDuration(15); setAlsoPostToStoryline(false);
        setAiPickedTrack(null);
      }
    }
  }, [isOpen]);

  // Load postToEdit
  useEffect(() => {
    if (postToEdit) {
      setTitle(postToEdit.title || '');
      setBody(postToEdit.body || '');
      setCategory(postToEdit.category || '');
      setMediaPreviews(postToEdit.media_urls || []);
      setThumbnailPreview(postToEdit.thumbnail_url || '');
      setMusicStart(postToEdit.music_start_seconds || 0);
      setMusicDuration(postToEdit.music_duration_seconds || 15);
      if (postToEdit.music_track_id) {
        supabase.from('music_tracks').select('*').eq('id', postToEdit.music_track_id).maybeSingle()
          .then(({ data }) => { if (data) setSelectedMusicTrack(data); });
      }
    }
  }, [postToEdit]);

  // Preselected track
  useEffect(() => {
    if (isOpen && preselectedTrack) {
      setSelectedMusicTrack(preselectedTrack);
      if (preselectedTrack.duration_seconds)
        setMusicDuration(Math.min(preselectedTrack.duration_seconds, 30));
      setStep(0);
    }
  }, [isOpen, preselectedTrack]);

  // Generate video thumbnail
  const generateVideoThumbnail = (file: File): Promise<{ blob: Blob; url: string } | null> =>
    new Promise(resolve => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.preload = 'metadata'; video.muted = true; video.playsInline = true; video.src = url;
      video.onloadedmetadata = () => { video.currentTime = Math.min(0.35, Math.max(0, (video.duration || 1) - 0.1)); };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720; canvas.height = video.videoHeight || 1280;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob ? { blob, url: URL.createObjectURL(blob) } : null); }, 'image/jpeg', 0.82);
      };
      video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    });

  // Handle media select
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => {
      const max = f.type.startsWith('video/') ? 500 * 1024 * 1024 : 20 * 1024 * 1024;
      if (f.size > max) { toast({ title: 'File too large', variant: 'destructive' }); return false; }
      return f.type.startsWith('image/') || f.type.startsWith('video/');
    });
    if (valid.length + mediaFiles.length > 3) { toast({ title: 'Max 3 files', variant: 'destructive' }); return; }
    setMediaFiles(prev => [...prev, ...valid]);
    valid.forEach(f => setMediaPreviews(prev => [...prev, URL.createObjectURL(f)]));
    const firstVideo = valid.find(f => f.type.startsWith('video/'));
    if (firstVideo && !thumbnailPreview) {
      const result = await generateVideoThumbnail(firstVideo);
      if (result) { setThumbnailBlob(result.blob); setThumbnailPreview(result.url); }
    }
    if (valid.length > 0) setStep(1);
  };

  const removeMedia = (i: number) => {
    URL.revokeObjectURL(mediaPreviews[i]);
    setMediaFiles(prev => prev.filter((_, idx) => idx !== i));
    setMediaPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  // AI Vibe Sync
  const runVibeSync = useCallback(async () => {
    if (!title && !body) return;
    setVibeLoading(true);
    try {
      const { data: tracks } = await supabase
        .from('music_tracks')
        .select('*')
        .eq('status', 'active')
        .eq('source', 'community')
        .order('usage_count', { ascending: false })
        .limit(50);

      if (!tracks || tracks.length === 0) return;
      setCommunityTracks(tracks);

      const keywords = `${title} ${body} ${category}`.toLowerCase().split(/\s+/);
      const scored = tracks.map(track => {
        const trackText = `${track.title} ${track.artist_name}`.toLowerCase();
        const score = keywords.reduce((acc, kw) => acc + (trackText.includes(kw) ? 2 : 0), 0);
        return { track, score: score + Math.random() * 0.5 };
      });
      scored.sort((a, b) => b.score - a.score);

      const picked = scored[0]?.track;
      if (picked) {
        setAiPickedTrack(picked);
        setSelectedMusicTrack(picked);
        if (picked.duration_seconds) setMusicDuration(Math.min(picked.duration_seconds, 30));
      }
    } catch (e) {
      console.error('Vibe sync error:', e);
    } finally {
      setVibeLoading(false);
    }
  }, [title, body, category]);

  useEffect(() => {
    if (step === 1 && !selectedMusicTrack && !postToEdit) {
      const timer = setTimeout(() => runVibeSync(), 800);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Upload helpers
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
    if (!user) return thumbnailPreview?.startsWith('http') ? thumbnailPreview : null;
    const fileLike = thumbnailFile || thumbnailBlob;
    if (!fileLike) return thumbnailPreview?.startsWith('http') ? thumbnailPreview : null;
    const ext = thumbnailFile ? thumbnailFile.name.split('.').pop() : 'jpg';
    const name = `${user.id}/thumb-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-media').upload(name, fileLike);
    if (error) return null;
    return supabase.storage.from('post-media').getPublicUrl(name).data.publicUrl;
  };

  const ensureMusicTrackId = async (): Promise<string | null> => {
    if (!selectedMusicTrack) return null;
    if (!selectedMusicTrack.id?.startsWith('spotify-') && !selectedMusicTrack.id?.startsWith('yt-'))
      return selectedMusicTrack.id;
    const ext = selectedMusicTrack.external_id || selectedMusicTrack.youtube_id;
    if (!ext) return null;
    const { data: existing } = await supabase.from('music_tracks').select('id').eq('external_id', ext).maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created } = await supabase.from('music_tracks').insert({
      title: selectedMusicTrack.title,
      artist_name: selectedMusicTrack.artist_name,
      cover_url: selectedMusicTrack.cover_url,
      duration_seconds: selectedMusicTrack.duration_seconds || 0,
      source: 'community',
      external_id: ext,
      youtube_id: selectedMusicTrack.youtube_id,
      audio_url: '',
      status: 'active',
    }).select('id').single();
    return created?.id || null;
  };

  // SUBMIT
  const handleSubmit = async () => {
    if (!user || !title.trim() || !body.trim() || !category) {
      toast({ title: 'Missing info', description: 'Please fill title, caption and category', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const mediaUrls = await uploadMedia();
      const thumbUrl = await uploadThumbnail();
      const musicTrackId = await ensureMusicTrackId();

      if (postToEdit?.id) {
        await supabase.from('posts').update({
          title: title.trim(),
          body: body.trim(),
          category,
          media_urls: mediaUrls,
          thumbnail_url: thumbUrl,
          music_track_id: musicTrackId,
          music_start_seconds: musicStart,
          music_duration_seconds: musicDuration,
        } as any).eq('id', postToEdit.id);
        toast({ title: 'Post updated!' });
      } else {
        const { data: newPost } = await supabase.from('posts').insert({
          title: title.trim(),
          body: body.trim(),
          category,
          media_urls: mediaUrls,
          user_id: user.id,
          status: 'approved',
          post_status: 'new',
          thumbnail_url: thumbUrl,
          music_track_id: musicTrackId,
          music_start_seconds: musicStart,
          music_duration_seconds: musicDuration,
          boosted: selectedMusicTrack && selectedMusicTrack.id === aiPickedTrack?.id ? true : false,
        } as any).select('id').single();

        // Update music usage
        if (musicTrackId) {
          const { data: tr } = await supabase.from('music_tracks').select('usage_count').eq('id', musicTrackId).maybeSingle();
          await supabase.from('music_tracks').update({
            usage_count: (tr?.usage_count || 0) + 1,
            last_used_at: new Date().toISOString()
          }).eq('id', musicTrackId);
        }

        // FIXED STORYLINE TOGGLE
        if (alsoPostToStoryline && mediaUrls.length > 0) {
          const isVid = /\.(mp4|webm|ogg|mov)$/i.test(mediaUrls[0]);
          await supabase.from('user_storylines').insert({
            user_id: user.id,
            media_url: mediaUrls[0],
            media_type: isVid ? 'video' : 'image',
            caption: title.trim(),
            preview_url: thumbUrl || mediaUrls[0],
            music_url: selectedMusicTrack?.audio_url || null,
            music_track_id: musicTrackId,
            music_start_seconds: musicStart,
            music_duration_seconds: musicDuration,
            status: 'active',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          } as any);
          toast({ title: '🎉 Post created!', description: 'Also added to your Story for 24 hours, start earning!' });
        } else {
          toast({ title: '🎉 Post live!', description: 'Your post is now on the feed, share your post to reach more viewers to unlock higher rewards, more views more money!' });
        }
      }

      onOpenChange?.(false);
      onPostCreated?.();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to create post', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const hasMedia = mediaPreviews.length > 0;
  const canProceed = step === 0 ? hasMedia : step === 1 ? title.trim().length > 0 && !!category && body.trim().length >= 5 : true;

  // STEP 0: CAPTURE
  const renderCapture = () => (
    <div className="flex flex-col h-full bg-black">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => onOpenChange?.(false)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white font-bold text-base">New Post</span>
        <div className="w-9" />
      </div>

      {hasMedia ? (
        <div className="flex-1 relative">
          {mediaFiles[0]?.type.startsWith('video/') || mediaPreviews[0]?.match(/\.(mp4|webm|ogg|mov)/i) ? (
            <video src={mediaPreviews[0]} className="w-full h-full object-cover" muted playsInline />
          ) : (
            <img src={mediaPreviews[0]} className="w-full h-full object-cover" alt="preview" />
          )}
          <button onClick={() => removeMedia(0)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
            <X className="w-4 h-4 text-white" />
          </button>
          {mediaPreviews.length > 1 && (
            <div className="absolute bottom-3 left-3 flex gap-2">
              {mediaPreviews.slice(1).map((p, i) => (
                <div key={i} className="relative w-12 h-12 rounded-lg overflow-hidden border-2 border-white">
                  {mediaFiles[i + 1]?.type.startsWith('video/') ? (
                    <video src={p} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={p} className="w-full h-full object-cover" alt="" />
                  )}
                  <button onClick={() => removeMedia(i + 1)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
              {mediaPreviews.length < 3 && (
                <label className="w-12 h-12 rounded-lg border-2 border-dashed border-white/50 flex items-center justify-center cursor-pointer">
                  <Upload className="w-4 h-4 text-white/70" />
                  <input type="file" multiple accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
                </label>
              )}
            </div>
          )}
          <div className="absolute bottom-4 right-4">
            <Button onClick={() => setStep(1)} className="bg-primary text-white font-bold px-6 rounded-full">
              Next →
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <label className="w-full cursor-pointer">
            <div className="w-full border-2 border-dashed border-white/30 rounded-2xl p-10 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-base">Upload Video or Photo</p>
                <p className="text-white/50 text-xs mt-1">Max 3 files · Images 20MB · Videos 500MB</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
          </label>

          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs">or</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          <label className="cursor-pointer">
            <div className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10">
              <Camera className="w-9 h-9 text-white" />
            </div>
            <input type="file" accept="image/*,video/*" capture="environment" onChange={handleMediaChange} className="hidden" />
          </label>
          <p className="text-white/50 text-xs">Tap to open camera</p>
        </div>
      )}
    </div>
  );

  // STEP 1: DETAILS
  const renderDetails = () => (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/50">
        <button onClick={() => setStep(0)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-sm flex-1">Add Details</span>
        <span className="text-xs text-muted-foreground">Step 2 of 3</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {hasMedia && (
          <div className="flex gap-2">
            {mediaPreviews.slice(0, 3).map((p, i) => (
              <div key={i} className="w-14 h-14 rounded-xl overflow-hidden border border-border">
                {mediaFiles[i]?.type.startsWith('video/') ? (
                  <video src={p} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={p} className="w-full h-full object-cover" alt="" />
                )}
              </div>
            ))}
          </div>
        )}

        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a title..." maxLength={100}
          className="font-semibold text-base border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent" />

        <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write a caption..."
          maxLength={2000} rows={4} className="resize-none border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent text-sm" />
        <div className="text-[10px] text-muted-foreground text-right">{body.length}/2000</div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="border-0 border-b rounded-none px-0 focus:ring-0 bg-transparent">
            <SelectValue placeholder="Select category..." />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Vibe Sync */}
        <div className="p-3 rounded-2xl bg-muted/50 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">Vibe Sync</span>
              {vibeLoading && <span className="text-xs text-muted-foreground animate-pulse">AI picking...</span>}
            </div>
            <button onClick={runVibeSync} className="text-xs text-primary flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Resync
            </button>
          </div>

          {selectedMusicTrack ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-xl">
                {selectedMusicTrack.cover_url ? (
                  <img src={selectedMusicTrack.cover_url} className="w-10 h-10 rounded-lg object-cover" alt="" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Music className="w-5 h-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedMusicTrack.title}</p>
                  <p className="text-xs text-muted-foreground truncate">@{selectedMusicTrack.artist_name}</p>
                  {selectedMusicTrack.id === aiPickedTrack?.id && (
                    <Badge className="text-[9px] h-4 px-1 bg-green-500/20 text-green-600 mt-0.5">✨ AI · More views</Badge>
                  )}
                </div>
                <button onClick={() => { setSelectedMusicTrack(null); setAiPickedTrack(null); }}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => setShowMusicPicker(true)} className="text-xs text-primary underline">
                Change sound
              </button>
            </div>
          ) : (
            <button onClick={() => setShowMusicPicker(true)}
              className="w-full py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Music className="w-4 h-4" /> Pick community sound
            </button>
          )}
        </div>

        {/* Music picker */}
        <AnimatePresence>
          {showMusicPicker && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 flex items-end">
              <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                className="w-full bg-card rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-base">Community Sounds</h3>
                  <button onClick={() => setShowMusicPicker(false)}><X className="w-5 h-5" /></button>
                </div>
                {communityTracks.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-6">No sounds available</p>
                ) : (
                  <div className="space-y-2">
                    {communityTracks.map(track => (
                      <button key={track.id} onClick={() => {
                        setSelectedMusicTrack(track);
                        if (track.duration_seconds) setMusicDuration(Math.min(track.duration_seconds, 30));
                        setShowMusicPicker(false);
                      }} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted text-left">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          {track.cover_url ? (
                            <img src={track.cover_url} className="w-full h-full rounded-lg object-cover" alt="" />
                          ) : (
                            <Music className="w-5 h-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{track.title}</p>
                          <p className="text-xs text-muted-foreground truncate">@{track.artist_name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Storyline toggle */}
        {!postToEdit && hasMedia && (
          <button onClick={() => setAlsoPostToStoryline(v => !v)}
            className={`w-full p-3 rounded-2xl border-2 transition-all text-left ${alsoPostToStoryline ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className={`w-4 h-4 ${alsoPostToStoryline ? 'text-primary' : 'text-muted-foreground'}`} />
                <div>
                  <p className="text-sm font-semibold">Add to Storyline</p>
                  <p className="text-[10px] text-muted-foreground">Share as 24-hour story</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${alsoPostToStoryline ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${alsoPostToStoryline ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
          </button>
        )}
      </div>

      <div className="px-4 pb-6 pt-3 border-t border-border/50">
        <Button onClick={() => setStep(2)} disabled={!canProceed}
          className="w-full h-12 rounded-2xl font-bold text-base bg-gradient-to-r from-primary to-accent text-white">
          Preview Post →
        </Button>
      </div>
    </div>
  );

  // STEP 2: LAUNCH
  const renderLaunch = () => (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/50">
        <button onClick={() => setStep(1)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-sm flex-1">Ready to Post</span>
        <span className="text-xs text-muted-foreground">Step 3 of 3</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {hasMedia && (
          <div className="rounded-2xl overflow-hidden border border-border">
            {mediaFiles[0]?.type.startsWith('video/') || mediaPreviews[0]?.match(/\.(mp4|webm|ogg|mov)/i) ? (
              <video src={mediaPreviews[0]} className="w-full max-h-48 object-cover" muted playsInline />
            ) : (
              <img src={mediaPreviews[0]} className="w-full max-h-48 object-cover" alt="" />
            )}
          </div>
        )}

        <div className="space-y-3 p-4 rounded-2xl bg-muted/30 border border-border/50">
          <div>
            <p className="text-xs text-muted-foreground">Title</p>
            <p className="font-bold text-sm">{title}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Category</p>
            <span className="text-xs bg-muted px-2 py-0.5 rounded">{category}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Caption</p>
            <p className="text-sm line-clamp-3">{body}</p>
          </div>
          {selectedMusicTrack && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Music className="w-3.5 h-3.5" />
              <span>{selectedMusicTrack.title} — {selectedMusicTrack.artist_name}</span>
              {selectedMusicTrack.id === aiPickedTrack?.id && (
                <span className="text-[9px] h-4 px-1 bg-green-500/20 text-green-600">✨ AI</span>
              )}
            </div>
          )}
          {alsoPostToStoryline && (
            <div className="flex items-center gap-2 text-xs text-primary font-semibold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Posting to Storyline (24hrs)</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-6 pt-3 border-t border-border/50 space-y-2">
        <Button onClick={handleSubmit} disabled={loading}
          className="w-full h-14 rounded-2xl font-black text-lg bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30">
          {loading ? 'Publishing...' : '🚀 Post & Earn'}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Your post will be live on the feed instantly
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="flex flex-col h-full">
            {step === 0 && renderCapture()}
            {step === 1 && renderDetails()}
            {step === 2 && renderLaunch()}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostWizard;

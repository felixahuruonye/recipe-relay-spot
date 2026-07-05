import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ArrowLeft, Music, Sparkles, Upload, Camera, RefreshCw, BookOpen, Image as ImageIcon, Play, Pause, SwitchCamera } from 'lucide-react';
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
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [selectedMusicTrack, setSelectedMusicTrack] = useState<any>(null);
  const [musicStart, setMusicStart] = useState(0);
  const [musicDuration, setMusicDuration] = useState(15);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [communityTracks, setCommunityTracks] = useState<any[]>([]);
  const [aiPickedTrack, setAiPickedTrack] = useState<any>(null);
  const [alsoPostToStoryline, setAlsoPostToStoryline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<number | null>(null);
  const [playingPickerId, setPlayingPickerId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      if (!postToEdit) {
        setMediaFiles([]);
        setMediaPreviews([]);
        setTitle('');
        setBody('');
        setCategory('');
        setSelectedMusicTrack(null);
        setThumbnailFile(null);
        setThumbnailBlob(null);
        setThumbnailPreview('');
        setMusicStart(0);
        setMusicDuration(15);
        setAlsoPostToStoryline(false);
        setAiPickedTrack(null);
      }
    }
  }, [isOpen]);

  // ---------- Live camera lifecycle ----------
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (mode: 'user' | 'environment' = facingMode) => {
    setCameraError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (e: any) {
      setCameraError(e?.message || 'Camera not available');
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (isOpen && step === 0) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, facingMode]);

  // Preview-audio cleanup
  useEffect(() => () => {
    previewAudioRef.current?.pause();
    recordAudioRef.current?.pause();
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
  }, []);

  const pickRandomCommunityTrack = useCallback(async () => {
    if (selectedMusicTrack) return selectedMusicTrack;
    let pool = communityTracks;
    if (!pool.length) {
      const { data } = await supabase
        .from('music_tracks').select('*').eq('status', 'active')
        .order('usage_count', { ascending: false, nullsFirst: false }).limit(50);
      pool = data || [];
      if (pool.length) setCommunityTracks(pool);
    }
    const withAudio = pool.filter((t: any) => t.audio_url);
    const picked = (withAudio.length ? withAudio : pool)[Math.floor(Math.random() * (withAudio.length || pool.length))];
    if (picked) {
      setSelectedMusicTrack(picked);
      setAiPickedTrack(picked);
      if (picked.duration_seconds) setMusicDuration(Math.min(picked.duration_seconds, 30));
    }
    return picked;
  }, [communityTracks, selectedMusicTrack]);

  const takePhoto = async () => {
    const video = cameraVideoRef.current;
    if (!video || !cameraReady) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (mediaFiles.length >= 3) { toast({ title: 'Max 3 files', variant: 'destructive' }); return; }
      setMediaFiles(prev => [...prev, file]);
      setMediaPreviews(prev => [...prev, URL.createObjectURL(blob)]);
    }, 'image/jpeg', 0.9);
  };

  const startRecording = async () => {
    if (!streamRef.current || isRecording) return;
    // AI auto-pick a community sound to play during the recording
    const track = await pickRandomCommunityTrack();
    if (track?.audio_url) {
      const audio = new Audio(track.audio_url);
      audio.volume = 0.7;
      audio.play().catch(() => {});
      recordAudioRef.current = audio;
    }
    try {
      recordChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
      const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = e => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        recordAudioRef.current?.pause(); recordAudioRef.current = null;
        const blob = new Blob(recordChunksRef.current, { type: mime || 'video/webm' });
        const file = new File([blob], `clip-${Date.now()}.webm`, { type: blob.type });
        if (mediaFiles.length >= 3) { toast({ title: 'Max 3 files', variant: 'destructive' }); return; }
        setMediaFiles(prev => [...prev, file]);
        const url = URL.createObjectURL(blob);
        setMediaPreviews(prev => [...prev, url]);
        const thumb = await generateVideoThumbnail(file);
        if (thumb && !thumbnailPreview) { setThumbnailBlob(thumb.blob); setThumbnailPreview(thumb.url); }
      };
      rec.start();
      recorderRef.current = rec;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds(s => {
          if (s + 1 >= 60) { stopRecording(); return 60; }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      console.error(e);
      toast({ title: 'Recording failed', variant: 'destructive' });
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    if (recordTimerRef.current) { window.clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setIsRecording(false);
  };

  const togglePickerPreview = (track: any) => {
    if (!track.audio_url) return;
    if (playingPickerId === track.id) {
      previewAudioRef.current?.pause();
      setPlayingPickerId(null);
      return;
    }
    previewAudioRef.current?.pause();
    const audio = new Audio(track.audio_url);
    audio.volume = 0.6;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingPickerId(null);
    previewAudioRef.current = audio;
    setPlayingPickerId(track.id);
  };

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

  useEffect(() => {
    if (isOpen && preselectedTrack) {
      setSelectedMusicTrack(preselectedTrack);
      if (preselectedTrack.duration_seconds)
        setMusicDuration(Math.min(preselectedTrack.duration_seconds, 30));
      setStep(0);
    }
  }, [isOpen, preselectedTrack]);

  const generateVideoThumbnail = (file: File): Promise<{ blob: Blob; url: string } | null> =>
    new Promise(resolve => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.35, Math.max(0, (video.duration || 1) - 0.1));
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          resolve(blob ? { blob, url: URL.createObjectURL(blob) } : null);
        }, 'image/jpeg', 0.82);
      };
      video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    });

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => {
      const max = f.type.startsWith('video/') ? 500 * 1024 * 1024 : 20 * 1024 * 1024;
      if (f.size > max) { toast({ title: 'File too large', variant: 'destructive' }); return false; }
      return f.type.startsWith('image/') || f.type.startsWith('video/');
    });
    if (valid.length + mediaFiles.length > 3) {
      toast({ title: 'Max 3 files', variant: 'destructive' });
      return;
    }
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

  const runVibeSync = useCallback(async () => {
    if (!title && !body) return;
    setVibeLoading(true);
    try {
      const { data: tracks } = await supabase
        .from('music_tracks')
        .select('*')
        .eq('status', 'active')
        .order('usage_count', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
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

  // Ensure community tracks are always loaded for the picker, even without title/body
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('music_tracks')
        .select('*')
        .eq('status', 'active')
        .order('usage_count', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (data && data.length) setCommunityTracks(prev => (prev.length ? prev : data));
    })();
  }, []);

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
        await supabase.from('posts').insert({
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

        if (musicTrackId) {
          const { data: tr } = await supabase.from('music_tracks').select('usage_count').eq('id', musicTrackId).maybeSingle();
          await supabase.from('music_tracks').update({
            usage_count: (tr?.usage_count || 0) + 1,
            last_used_at: new Date().toISOString()
          }).eq('id', musicTrackId);
        }

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
          toast({ title: '🎉 Post created!', description: 'Also added to your Storyline for 24 hours!' });
        } else {
          toast({ title: '🎉 Post live!', description: 'Your post is now on the feed!' });
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

  const renderCapture = () => (
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* Live camera preview */}
      <video
        ref={cameraVideoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
      />
      {/* Dark gradient overlays for control legibility */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={() => onOpenChange?.(false)} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white font-bold text-base drop-shadow">New Post</span>
        <button
          onClick={() => setFacingMode(m => (m === 'user' ? 'environment' : 'user'))}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
          title="Switch camera"
        >
          <SwitchCamera className="w-5 h-5 text-white" />
        </button>
      </div>

      {cameraError && (
        <div className="relative z-10 mx-4 mt-2 p-3 rounded-xl bg-red-500/20 border border-red-400/30 text-white text-xs">
          {cameraError}. Use the gallery icon to upload instead.
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/90 backdrop-blur">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-white text-xs font-bold">REC {String(Math.floor(recordSeconds/60)).padStart(2,'0')}:{String(recordSeconds%60).padStart(2,'0')}</span>
          {selectedMusicTrack && (
            <span className="text-white/80 text-[10px] truncate max-w-[120px]">🎵 {selectedMusicTrack.title}</span>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="relative z-10 pb-4 px-4 flex flex-col gap-3">
        {/* Recent gallery strip (current-session media) */}
        {mediaPreviews.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mediaPreviews.map((p, i) => {
              const isVid = mediaFiles[i]?.type.startsWith('video/') || p.match(/\.(mp4|webm|ogg|mov)/i);
              return (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-white/80 shrink-0">
                  {isVid ? (
                    <video src={p} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={p} className="w-full h-full object-cover" alt="" />
                  )}
                  <button onClick={() => removeMedia(i)} className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-bl-md flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Capture row: camera icon | red record | gallery icon */}
        <div className="flex items-center justify-between px-4">
          <button
            onClick={takePhoto}
            disabled={!cameraReady || isRecording}
            className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center disabled:opacity-40"
            title="Take photo"
          >
            <Camera className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!cameraReady && !isRecording}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-transparent disabled:opacity-40"
            title={isRecording ? 'Stop' : 'Record'}
          >
            {isRecording ? (
              <span className="w-8 h-8 rounded-md bg-red-500" />
            ) : (
              <span className="w-14 h-14 rounded-full bg-red-500 shadow-[0_0_24px_rgba(239,68,68,0.6)]" />
            )}
          </button>

          <button
            onClick={() => galleryInputRef.current?.click()}
            className="w-12 h-12 rounded-full bg-white/15 backdrop-blur flex items-center justify-center"
            title="Open gallery"
          >
            <ImageIcon className="w-6 h-6 text-white" />
          </button>
          <input ref={galleryInputRef} type="file" multiple accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*,video/*" capture={facingMode === 'user' ? 'user' : 'environment'} onChange={handleMediaChange} className="hidden" />
        </div>

        {/* Next button */}
        {hasMedia && (
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} className="bg-primary text-white font-bold px-6 rounded-full">
              Next →
            </Button>
          </div>
        )}
        {!hasMedia && (
          <p className="text-center text-white/60 text-[11px]">
            Tap the red button to record · AI adds a community sound automatically
          </p>
        )}
      </div>
    </div>
  );

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
                    <span className="text-[9px] bg-green-500/20 text-green-600 px-1 rounded">✨ AI · More views</span>
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
                    {communityTracks.map(track => {
                      const isPlaying = playingPickerId === track.id;
                      return (
                        <div key={track.id} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 relative">
                            {track.cover_url ? (
                              <img src={track.cover_url} className="w-full h-full rounded-lg object-cover" alt="" />
                            ) : (
                              <Music className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setSelectedMusicTrack(track);
                              if (track.duration_seconds) setMusicDuration(Math.min(track.duration_seconds, 30));
                              previewAudioRef.current?.pause();
                              setPlayingPickerId(null);
                              setShowMusicPicker(false);
                            }}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-sm font-semibold truncate">{track.title}</p>
                            <p className="text-xs text-muted-foreground truncate">@{track.artist_name}</p>
                          </button>
                          {track.audio_url && (
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePickerPreview(track); }}
                              className="w-9 h-9 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center shrink-0"
                              title={isPlaying ? 'Stop preview' : 'Preview'}
                            >
                              {isPlaying ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-primary ml-0.5" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
                <span className="text-[9px] bg-green-500/20 text-green-600 px-1 rounded">✨ AI</span>
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
      <DialogContent className="max-w-full w-screen h-screen sm:max-w-full p-0 gap-0 rounded-none border-0 [&>button]:hidden flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="flex flex-col h-full w-full">
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

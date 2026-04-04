import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, Music2, BarChart3, TrendingUp, Play, Pause, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';


interface Track {
  id: string;
  title: string;
  artist_name: string;
  audio_url: string;
  cover_url: string | null;
  duration_seconds: number;
  genre: string;
  usage_count: number;
  status: string;
  created_at: string;
}

const genres = ['Afrobeats', 'Hip Hop', 'Pop', 'R&B', 'Gospel', 'Jazz', 'Electronic', 'Rock', 'Classical', 'General'];

const MusicianDashboard: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Upload form
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('General');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  useEffect(() => {
    if (user) loadTracks();
  }, [user]);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const loadTracks = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('music_tracks')
      .select('*')
      .eq('artist_id', user.id)
      .order('created_at', { ascending: false });
    setTracks((data as Track[]) || []);
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!user || !audioFile || !title.trim()) return;
    setUploading(true);

    try {
      // Upload audio
      const audioExt = audioFile.name.split('.').pop();
      const audioPath = `${user.id}/${Date.now()}.${audioExt}`;
      const { error: audioErr } = await supabase.storage.from('music').upload(audioPath, audioFile);
      if (audioErr) throw audioErr;
      const audioUrl = supabase.storage.from('music').getPublicUrl(audioPath).data.publicUrl;

      // Upload cover if provided
      let coverUrl = null;
      if (coverFile) {
        const coverExt = coverFile.name.split('.').pop();
        const coverPath = `${user.id}/cover-${Date.now()}.${coverExt}`;
        await supabase.storage.from('music').upload(coverPath, coverFile);
        coverUrl = supabase.storage.from('music').getPublicUrl(coverPath).data.publicUrl;
      }

      // Get duration from audio
      const duration = await getAudioDuration(audioFile);

      // Get username
      const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', user.id).single();

      await supabase.from('music_tracks').insert({
        title: title.trim(),
        artist_name: profile?.username || 'Unknown Artist',
        artist_id: user.id,
        audio_url: audioUrl,
        cover_url: coverUrl,
        duration_seconds: Math.round(duration),
        genre,
        source: 'upload',
      });

      toast({ title: '🎵 Track uploaded!', description: 'Your music is now available for creators' });
      setShowUpload(false);
      setTitle(''); setGenre('General'); setAudioFile(null); setCoverFile(null);
      loadTracks();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise(resolve => {
      const audio = new Audio(URL.createObjectURL(file));
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => resolve(0);
    });
  };

  const togglePlay = (track: Track) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      audioRef.current?.pause();
      const audio = new Audio(track.audio_url);
      audio.play().catch(() => {});
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(track.id);
    }
  };

  const totalUsage = tracks.reduce((sum, t) => sum + (t.usage_count || 0), 0);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-black">🎵 Musician Dashboard</h1>
            <p className="text-xs text-muted-foreground">Upload music · Earn royalties · Track usage</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <Music2 className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{tracks.length}</p>
              <p className="text-[10px] text-muted-foreground">Tracks</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <BarChart3 className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{totalUsage}</p>
              <p className="text-[10px] text-muted-foreground">Uses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">10%</p>
              <p className="text-[10px] text-muted-foreground">Royalty</p>
            </CardContent>
          </Card>
        </div>

        {/* Upload section */}
        {showUpload ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Upload New Track</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Track Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="My awesome beat" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Genre</Label>
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {genres.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Audio File (.mp3, .wav) *</Label>
                <Input type="file" accept="audio/*" onChange={e => setAudioFile(e.target.files?.[0] || null)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Cover Image (optional)</Label>
                <Input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} className="h-8 text-xs" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpload} disabled={uploading || !audioFile || !title.trim()}>
                  {uploading ? 'Uploading...' : '🎵 Upload Track'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowUpload(true)} className="w-full gap-2">
            <Upload className="w-4 h-4" /> Upload New Track
          </Button>
        )}

        {/* Track list */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold">Your Tracks</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
          ) : tracks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Music2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tracks uploaded yet</p>
              <p className="text-xs">Upload music and earn 10% royalty when creators use it!</p>
            </div>
          ) : (
            tracks.map(track => (
              <Card key={track.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <button
                    onClick={() => togglePlay(track)}
                    className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"
                  >
                    {playingId === track.id ? (
                      <Pause className="w-4 h-4 text-primary" />
                    ) : (
                      <Play className="w-4 h-4 text-primary ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{track.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{track.genre}</Badge>
                      <span>{track.usage_count || 0} uses</span>
                      <span>{Math.floor(track.duration_seconds / 60)}:{(track.duration_seconds % 60).toString().padStart(2, '0')}</span>
                    </div>
                  </div>
                  <Badge className={track.status === 'active' ? 'bg-green-500/10 text-green-600 text-[9px]' : 'text-[9px]'}>
                    {track.status}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default MusicianDashboard;

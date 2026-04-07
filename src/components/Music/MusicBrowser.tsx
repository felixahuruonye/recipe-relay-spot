import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Play, Pause, Music2, Check, Loader2, Globe } from 'lucide-react';

interface MusicTrack {
  id: string;
  title: string;
  artist_name: string;
  audio_url: string;
  cover_url?: string;
  duration_seconds: number;
  genre: string;
  source: string;
  youtube_id?: string;
}

interface MusicBrowserProps {
  selectedTrackId?: string;
  onSelect: (track: MusicTrack | null) => void;
}

const MusicBrowser: React.FC<MusicBrowserProps> = ({ selectedTrackId, onSelect }) => {
  const [tab, setTab] = useState<'community' | 'lenory_free'>('community');
  const [search, setSearch] = useState('');
  const [communityTracks, setCommunityTracks] = useState<MusicTrack[]>([]);
  const [freeTracks, setFreeTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    loadCommunityTracks();
  }, []);

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const loadCommunityTracks = async () => {
    const { data } = await supabase
      .from('music_tracks')
      .select('*')
      .eq('status', 'active')
      .order('usage_count', { ascending: false })
      .limit(50);
    setCommunityTracks((data as MusicTrack[]) || []);
  };

  const searchFreeSounds = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('music-search', {
        body: { query }
      });
      if (error) throw error;
      setFreeTracks(data?.tracks || []);
    } catch (e) {
      console.error('Music search error:', e);
      setFreeTracks([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = (track: MusicTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();

    // For community tracks, use audio_url directly
    if (track.source !== 'lenory_free') {
      const audio = new Audio(track.audio_url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(track.id);
    } else if (track.youtube_id) {
      // For Lenory Free Sounds, we can't preview directly (YouTube needs iframe)
      // Just select it
      handleSelect(track);
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSelect = (track: MusicTrack) => {
    audioRef.current?.pause();
    setPlayingId(null);
    if (selectedTrackId === track.id) {
      onSelect(null);
    } else {
      onSelect(track);
    }
  };

  const filteredCommunity = search.trim()
    ? communityTracks.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.artist_name.toLowerCase().includes(search.toLowerCase())
      )
    : communityTracks;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-muted rounded-lg p-0.5">
        <button
          onClick={() => setTab('community')}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
            tab === 'community' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          <Music2 className="w-3 h-3 inline mr-1" /> Community
        </button>
        <button
          onClick={() => setTab('lenory_free')}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
            tab === 'lenory_free' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          <Globe className="w-3 h-3 inline mr-1" /> Lenory Free Sounds
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'lenory_free' ? 'Search songs (Spotify+YouTube)...' : 'Search community tracks...'}
            className="pl-8 h-8 text-xs"
            onKeyDown={e => {
              if (e.key === 'Enter' && tab === 'lenory_free') searchFreeSounds(search);
            }}
          />
        </div>
        {tab === 'lenory_free' && (
          <Button size="sm" variant="outline" onClick={() => searchFreeSounds(search)} disabled={loading} className="h-8 text-xs">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Search'}
          </Button>
        )}
      </div>

      {selectedTrackId && (
        <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
          <Check className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-medium text-primary truncate">Music selected ✓</span>
          <Button size="sm" variant="ghost" className="ml-auto h-6 text-[10px]" onClick={() => onSelect(null)}>Remove</Button>
        </div>
      )}

      <ScrollArea className="h-[220px]">
        <div className="space-y-1">
          {(tab === 'community' ? filteredCommunity : freeTracks).map(track => (
            <div
              key={track.id}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                selectedTrackId === track.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''
              }`}
              onClick={() => handleSelect(track)}
            >
              <div className="w-9 h-9 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                {track.cover_url ? (
                  <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music2 className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{track.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{track.artist_name}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {track.duration_seconds > 0 && (
                  <span className="text-[10px] text-muted-foreground">{formatDuration(track.duration_seconds)}</span>
                )}
                <Badge variant="outline" className="text-[8px] h-4 px-1">
                  {track.source === 'lenory_free' ? '🎵 Free' : '👤'}
                </Badge>
              </div>
              {track.source !== 'lenory_free' && (
                <button
                  onClick={e => { e.stopPropagation(); togglePlay(track); }}
                  className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 shrink-0"
                >
                  {playingId === track.id ? <Pause className="w-3 h-3 text-primary" /> : <Play className="w-3 h-3 text-primary ml-0.5" />}
                </button>
              )}
            </div>
          ))}

          {((tab === 'community' && filteredCommunity.length === 0) || (tab === 'lenory_free' && freeTracks.length === 0)) && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              <Music2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">
                {tab === 'lenory_free' ? 'Search for songs above (2⭐ per use)' : 'No community tracks yet'}
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
              <p className="text-xs text-muted-foreground mt-2">Searching Spotify...</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {tab === 'lenory_free' && (
        <p className="text-[10px] text-muted-foreground text-center">
          Powered by Spotify + YouTube · 2⭐ per use · No royalties
        </p>
      )}
    </div>
  );
};

export default MusicBrowser;

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Play, Pause, Music2, Check } from 'lucide-react';

interface MusicTrack {
  id: string;
  title: string;
  artist_name: string;
  audio_url?: string;
  cover_url?: string;
  duration_seconds: number;
  genre?: string;
  source: string;
  external_id?: string;
  artist_id?: string;
  usage_count?: number;
  last_used_at?: string;
}

interface MusicBrowserProps {
  selectedTrackId?: string;
  onSelect: (track: MusicTrack | null) => void;
}

const MusicBrowser: React.FC<MusicBrowserProps> = ({ selectedTrackId, onSelect }) => {
  const [search, setSearch] = useState('');
  const [communityTracks, setCommunityTracks] = useState<MusicTrack[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { loadCommunityTracks(); }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const loadCommunityTracks = async () => {
    const { data } = await supabase
      .from('music_tracks')
      .select('*')
      .eq('status', 'active')
      .order('usage_count', { ascending: false, nullsFirst: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50);
    setCommunityTracks((data as MusicTrack[]) || []);
  };

  const togglePlay = (track: MusicTrack) => {
    audioRef.current?.pause();
    if (playingId === track.id) { setPlayingId(null); return; }
    if (track.audio_url) {
      const audio = new Audio(track.audio_url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(track.id);
    }
  };

  const formatDuration = (s: number) => {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSelect = (track: MusicTrack) => {
    audioRef.current?.pause();
    setPlayingId(null);
    if (selectedTrackId === track.id) onSelect(null);
    else onSelect(track);
  };

  const filteredCommunity = search.trim()
    ? communityTracks.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.artist_name.toLowerCase().includes(search.toLowerCase())
      )
    : communityTracks;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Music2 className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold">Community Sounds</span>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search community tracks..."
          className="pl-8 h-8 text-xs"
        />
      </div>

      {selectedTrackId && (() => {
        const sel = communityTracks.find(t => t.id === selectedTrackId);
        const canReplay = sel && !!sel.audio_url;
        const isReplaying = sel && playingId === sel.id;
        return (
          <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20">
            <Check className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-medium text-primary truncate">Music selected ✓</span>
            {sel && canReplay && (
              <button
                type="button"
                onClick={() => togglePlay(sel)}
                className="ml-auto h-6 px-2 rounded-full bg-primary/20 hover:bg-primary/30 flex items-center gap-1 text-[10px] font-semibold text-primary"
              >
                {isReplaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {isReplaying ? 'Stop' : 'Replay'}
              </button>
            )}
            <Button size="sm" variant="ghost" className={`${sel && canReplay ? '' : 'ml-auto'} h-6 text-[10px]`} onClick={() => onSelect(null)}>Remove</Button>
          </div>
        );
      })()}

      <ScrollArea className="h-[260px]">
        <div className="space-y-1">
          {filteredCommunity.map((track, idx) => {
            const isPlaying = playingId === track.id;
            const canPreview = !!track.audio_url;
            const isTopTrending = idx === 0 && filteredCommunity.length > 1;
            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${selectedTrackId === track.id ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                onClick={() => handleSelect(track)}
              >
                <div className="w-9 h-9 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center relative">
                  {track.cover_url ? (
                    <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music2 className="w-4 h-4 text-muted-foreground" />
                  )}
                  {isTopTrending && (
                    <span className="absolute -top-1 -left-1 text-[10px]">🔥</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate flex items-center gap-1">
                    {track.title}
                    {isTopTrending && <Badge variant="secondary" className="text-[8px] h-3.5 px-1">Trending</Badge>}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{track.artist_name}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!!track.duration_seconds && (
                    <span className="text-[10px] text-muted-foreground">{formatDuration(track.duration_seconds)}</span>
                  )}
                  {(track.usage_count || 0) > 0 && (
                    <Badge variant="secondary" className="text-[8px] h-4 px-1" title="Times used in posts">
                      {track.usage_count}× used
                    </Badge>
                  )}
                </div>
                {canPreview && (
                  <button
                    onClick={e => { e.stopPropagation(); togglePlay(track); }}
                    className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 shrink-0"
                    title={isPlaying ? 'Stop preview' : 'Preview'}
                  >
                    {isPlaying ? <Pause className="w-3 h-3 text-primary" /> : <Play className="w-3 h-3 text-primary ml-0.5" />}
                  </button>
                )}
              </div>
            );
          })}

          {filteredCommunity.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Music2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No community tracks yet</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default MusicBrowser;

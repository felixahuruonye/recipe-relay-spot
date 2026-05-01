ALTER TABLE public.music_tracks ADD COLUMN IF NOT EXISTS youtube_id TEXT;
CREATE INDEX IF NOT EXISTS idx_music_tracks_external_id ON public.music_tracks(external_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_youtube_id ON public.music_tracks(youtube_id);
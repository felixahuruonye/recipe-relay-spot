-- Music tracks table for musician uploads
CREATE TABLE IF NOT EXISTS public.music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist_name text NOT NULL,
  artist_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audio_url text NOT NULL,
  cover_url text,
  duration_seconds integer DEFAULT 0,
  genre text DEFAULT 'General',
  source text DEFAULT 'upload',
  external_id text,
  usage_count integer DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.music_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active music tracks"
  ON public.music_tracks FOR SELECT
  USING (status = 'active');

CREATE POLICY "Artists can insert their own tracks"
  ON public.music_tracks FOR INSERT
  TO authenticated
  WITH CHECK (artist_id = auth.uid());

CREATE POLICY "Artists can update their own tracks"
  ON public.music_tracks FOR UPDATE
  TO authenticated
  USING (artist_id = auth.uid());

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS music_track_id uuid REFERENCES public.music_tracks(id) ON DELETE SET NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('music', 'music', true)
ON CONFLICT (id) DO NOTHING;
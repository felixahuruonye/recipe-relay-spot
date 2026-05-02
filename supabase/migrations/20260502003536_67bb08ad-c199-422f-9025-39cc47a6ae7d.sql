
ALTER TABLE public.music_tracks
  ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS music_tracks_trending_idx
  ON public.music_tracks (usage_count DESC, last_used_at DESC NULLS LAST, created_at ASC);

CREATE OR REPLACE FUNCTION public.bump_music_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.music_track_id IS NOT NULL THEN
      UPDATE public.music_tracks
      SET usage_count = COALESCE(usage_count, 0) + 1,
          last_used_at = now()
      WHERE id = NEW.music_track_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.music_track_id IS DISTINCT FROM OLD.music_track_id THEN
      IF OLD.music_track_id IS NOT NULL THEN
        UPDATE public.music_tracks
        SET usage_count = GREATEST(COALESCE(usage_count, 1) - 1, 0)
        WHERE id = OLD.music_track_id;
      END IF;
      IF NEW.music_track_id IS NOT NULL THEN
        UPDATE public.music_tracks
        SET usage_count = COALESCE(usage_count, 0) + 1,
            last_used_at = now()
        WHERE id = NEW.music_track_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_bump_music_usage ON public.posts;
CREATE TRIGGER posts_bump_music_usage
AFTER INSERT OR UPDATE OF music_track_id ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.bump_music_usage();

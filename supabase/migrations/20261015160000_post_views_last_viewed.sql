-- Track last viewed time so dashboard period filters work after re-watches
ALTER TABLE public.post_views
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

UPDATE public.post_views
SET last_viewed_at = COALESCE(last_viewed_at, viewed_at, now())
WHERE last_viewed_at IS NULL;

-- Helper: upsert view for the logged-in user (dashboard + feed can call)
CREATE OR REPLACE FUNCTION public.touch_post_view(p_post_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_post_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.post_views (post_id, user_id, viewed_at, last_viewed_at)
  VALUES (p_post_id, v_uid, now(), now())
  ON CONFLICT (post_id, user_id)
  DO UPDATE SET last_viewed_at = now();
EXCEPTION WHEN OTHERS THEN
  -- unique index name variants
  BEGIN
    UPDATE public.post_views
    SET last_viewed_at = now()
    WHERE post_id = p_post_id AND user_id = v_uid;
    IF NOT FOUND THEN
      INSERT INTO public.post_views (post_id, user_id, viewed_at, last_viewed_at)
      VALUES (p_post_id, v_uid, now(), now());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_post_view(text) TO authenticated;

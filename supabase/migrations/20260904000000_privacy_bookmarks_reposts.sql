-- Privacy flag on posts (idempotent)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_is_private ON public.posts(is_private);
CREATE INDEX IF NOT EXISTS idx_posts_user_private ON public.posts(user_id, is_private);

-- If an earlier version of this migration already created user_bookmarks
-- with a posts-only (post_id) shape, drop it and recreate with the
-- generic (item_type, item_id) shape so it also supports products.
-- The feature was never functional before this migration, so there is
-- no real bookmark data to preserve.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_bookmarks' AND column_name = 'post_id'
  ) THEN
    DROP TABLE public.user_bookmarks;
  END IF;
END $$;

-- Generic bookmarks table: supports both posts and marketplace products.
-- posts.id and products.id are both TEXT, so we use a polymorphic
-- (item_type, item_id) pair instead of two separate FK columns.
CREATE TABLE IF NOT EXISTS public.user_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'product')),
  item_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(item_type, item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON public.user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_item ON public.user_bookmarks(item_type, item_id);

ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.user_bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.user_bookmarks
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can add bookmarks" ON public.user_bookmarks;
CREATE POLICY "Users can add bookmarks" ON public.user_bookmarks
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can remove their own bookmarks" ON public.user_bookmarks;
CREATE POLICY "Users can remove their own bookmarks" ON public.user_bookmarks
  FOR DELETE USING (user_id = auth.uid());

-- Track watch duration per view so "Viewed By" can show time spent
ALTER TABLE public.post_views ADD COLUMN IF NOT EXISTS watch_duration_seconds INTEGER NOT NULL DEFAULT 0;

-- Paid, time-limited unlock for a post owner's "Liked By" / "Viewed By" insights
CREATE TABLE IF NOT EXISTS public.post_insight_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_insight_unlocks_lookup ON public.post_insight_unlocks(post_id, user_id, expires_at);

ALTER TABLE public.post_insight_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own insight unlocks" ON public.post_insight_unlocks;
CREATE POLICY "Users can view their own insight unlocks" ON public.post_insight_unlocks
  FOR SELECT USING (user_id = auth.uid());

-- Inserts/updates only happen through unlock_post_insights (SECURITY DEFINER),
-- so no direct INSERT/UPDATE policy is granted to regular users here.

-- Deducts 25 stars from the caller and (re)activates a 28-day insights
-- unlock for the given post. Mirrors the star-deduction pattern used by
-- join_group_with_fee: SECURITY DEFINER, balance check, wallet_history log.
CREATE OR REPLACE FUNCTION public.unlock_post_insights(p_post_id text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_balance integer;
  v_cost integer := 25;
  v_expires timestamptz := now() + interval '28 days';
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT star_balance INTO v_user_balance FROM user_profiles WHERE id = p_user_id;

  IF v_user_balance IS NULL OR v_user_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
  END IF;

  UPDATE user_profiles
  SET star_balance = star_balance - v_cost
  WHERE id = p_user_id;

  INSERT INTO wallet_history (user_id, type, amount, currency, meta)
  VALUES (p_user_id, 'post_insights_unlock', -v_cost, 'stars', jsonb_build_object('post_id', p_post_id));

  INSERT INTO post_insight_unlocks (post_id, user_id, unlocked_at, expires_at)
  VALUES (p_post_id, p_user_id, now(), v_expires)
  ON CONFLICT (post_id, user_id)
  DO UPDATE SET unlocked_at = now(), expires_at = v_expires;

  RETURN jsonb_build_object('success', true, 'expires_at', v_expires);
END;
$$;

-- Adds watch time to the caller's own post_views row (best-effort, called
-- when a post scrolls out of view). No direct client UPDATE policy is
-- granted on post_views, so this goes through a narrow SECURITY DEFINER
-- function instead.
CREATE OR REPLACE FUNCTION public.record_watch_duration(p_post_id text, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_seconds IS NULL OR p_seconds <= 0 THEN
    RETURN;
  END IF;

  UPDATE post_views
  SET watch_duration_seconds = watch_duration_seconds + p_seconds
  WHERE post_id = p_post_id AND user_id = auth.uid();
END;
$$;

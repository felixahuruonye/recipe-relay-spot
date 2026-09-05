-- ============================================================
-- Creator Dashboard: Advanced Analytics + Earnings breakdown
-- All balance/star logic lives here (SECURITY DEFINER RPCs) so
-- none of it can be forged or bypassed from the client.
-- ============================================================

-- Demographic fields, only ever filled in by the user themselves via
-- Settings. Analytics below simply aggregate whatever real values exist -
-- no fake/sample data is ever generated for users who haven't set these.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
-- location_info (jsonb) already exists on user_profiles and is reused here
-- as { "country": "...", "state": "..." } - it was defined but never wired
-- up to any UI before now.

-- ------------------------------------------------------------
-- Paid 100-day unlock for the Creator Dashboard's advanced
-- analytics section (Details tab). Same pattern as the existing
-- post_insight_unlocks / unlock_post_insights, just scoped to the
-- whole dashboard instead of a single post.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_analytics_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

ALTER TABLE public.creator_analytics_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own analytics unlock" ON public.creator_analytics_unlocks;
CREATE POLICY "Users can view their own analytics unlock" ON public.creator_analytics_unlocks
  FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.unlock_creator_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
  v_cost integer := 250;
  v_expires timestamptz := now() + interval '100 days';
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT star_balance INTO v_balance FROM user_profiles WHERE id = p_user_id;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
  END IF;

  UPDATE user_profiles SET star_balance = star_balance - v_cost WHERE id = p_user_id;

  INSERT INTO wallet_history (user_id, type, amount, currency, meta)
  VALUES (p_user_id, 'creator_analytics_unlock', -v_cost, 'stars', '{}'::jsonb);

  INSERT INTO creator_analytics_unlocks (user_id, unlocked_at, expires_at)
  VALUES (p_user_id, now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE SET unlocked_at = now(), expires_at = v_expires;

  RETURN jsonb_build_object('success', true, 'expires_at', v_expires);
END;
$$;

-- ------------------------------------------------------------
-- Views over time (Total + New for a date range), scoped to the
-- calling creator's own posts only. Reads from the existing
-- post_views table. "New" = views whose viewed_at falls inside
-- [p_start, p_end]; "Total" = lifetime views on those same posts.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_creator_view_stats(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total bigint;
  v_new bigint;
  v_daily jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT count(*) INTO v_total
  FROM post_views pv JOIN posts p ON p.id = pv.post_id
  WHERE p.user_id = v_uid;

  SELECT count(*) INTO v_new
  FROM post_views pv JOIN posts p ON p.id = pv.post_id
  WHERE p.user_id = v_uid AND pv.viewed_at >= p_start AND pv.viewed_at <= p_end;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'views', c) ORDER BY d), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT date_trunc('day', pv.viewed_at) AS d, count(*) AS c
    FROM post_views pv JOIN posts p ON p.id = pv.post_id
    WHERE p.user_id = v_uid AND pv.viewed_at >= p_start AND pv.viewed_at <= p_end
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object('total_views', v_total, 'new_views', v_new, 'daily', v_daily);
END;
$$;

-- Gender breakdown of viewers, over the same date range, for the
-- calling creator's own posts. Only counts viewers who have set a
-- gender in Settings - everyone else is grouped under "unspecified"
-- rather than guessed at.
CREATE OR REPLACE FUNCTION public.get_creator_viewer_genders(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('gender', g, 'count', c) ORDER BY c DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT COALESCE(up.gender, 'unspecified') AS g, count(DISTINCT pv.user_id) AS c
    FROM post_views pv
    JOIN posts p ON p.id = pv.post_id
    LEFT JOIN user_profiles up ON up.id = pv.user_id
    WHERE p.user_id = v_uid AND pv.viewed_at >= p_start AND pv.viewed_at <= p_end AND pv.user_id IS NOT NULL
    GROUP BY 1
  ) s;

  RETURN v_result;
END;
$$;

-- Age-group breakdown of people who engage with the creator (viewed,
-- liked, commented, or followed), derived from date_of_birth where set.
CREATE OR REPLACE FUNCTION public.get_creator_viewer_ages(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', bucket, 'count', c) ORDER BY
      array_position(ARRAY['13-17','18-24','25-34','35-44','45-54','55+','unspecified'], bucket)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT bucket, count(*) AS c FROM (
      SELECT DISTINCT engager_id,
        CASE
          WHEN dob IS NULL THEN 'unspecified'
          WHEN date_part('year', age(dob)) < 18 THEN '13-17'
          WHEN date_part('year', age(dob)) < 25 THEN '18-24'
          WHEN date_part('year', age(dob)) < 35 THEN '25-34'
          WHEN date_part('year', age(dob)) < 45 THEN '35-44'
          WHEN date_part('year', age(dob)) < 55 THEN '45-54'
          ELSE '55+'
        END AS bucket
      FROM (
        SELECT pv.user_id AS engager_id, up.date_of_birth AS dob
        FROM post_views pv JOIN posts p ON p.id = pv.post_id
        LEFT JOIN user_profiles up ON up.id = pv.user_id
        WHERE p.user_id = v_uid AND pv.viewed_at >= p_start AND pv.viewed_at <= p_end AND pv.user_id IS NOT NULL
        UNION
        SELECT pl.user_id, up.date_of_birth
        FROM post_likes pl JOIN posts p ON p.id = pl.post_id
        LEFT JOIN user_profiles up ON up.id = pl.user_id
        WHERE p.user_id = v_uid AND pl.created_at >= p_start AND pl.created_at <= p_end
        UNION
        SELECT pc.user_id, up.date_of_birth
        FROM post_comments pc JOIN posts p ON p.id = pc.post_id
        LEFT JOIN user_profiles up ON up.id = pc.user_id
        WHERE p.user_id = v_uid AND pc.created_at >= p_start AND pc.created_at <= p_end
        UNION
        SELECT f.follower_id, up.date_of_birth
        FROM followers f
        LEFT JOIN user_profiles up ON up.id = f.follower_id
        WHERE f.following_id = v_uid AND f.created_at >= p_start AND f.created_at <= p_end
      ) engagers
    ) tagged
    GROUP BY bucket
  ) grouped;

  RETURN v_result;
END;
$$;

-- Location breakdown (country/state) of viewers, over the date range.
CREATE OR REPLACE FUNCTION public.get_creator_viewer_locations(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'state', state, 'count', c) ORDER BY c DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      COALESCE(up.location_info->>'country', 'Unknown') AS country,
      up.location_info->>'state' AS state,
      count(DISTINCT pv.user_id) AS c
    FROM post_views pv
    JOIN posts p ON p.id = pv.post_id
    LEFT JOIN user_profiles up ON up.id = pv.user_id
    WHERE p.user_id = v_uid AND pv.viewed_at >= p_start AND pv.viewed_at <= p_end AND pv.user_id IS NOT NULL
    GROUP BY 1, 2
  ) s;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- Earnings breakdown: per-post, from monetization_events which
-- already records creator_amount against post_id for every paid
-- view/tip. "Not yet monetized" is decided client-side from the
-- existing monetization_level column (already 0 by default).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_creator_post_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT p.id AS post_id, p.title, p.media_urls, p.view_count, p.created_at,
      COALESCE((SELECT sum(me.creator_amount) FROM monetization_events me WHERE me.post_id = p.id), 0) AS earned,
      COALESCE((SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS likes,
      COALESCE((SELECT count(*) FROM post_comments pc WHERE pc.post_id = p.id), 0) AS comments
    FROM posts p
    WHERE p.user_id = v_uid AND p.status = 'approved'
    ORDER BY p.created_at DESC
  ) s;

  RETURN v_result;
END;
$$;

-- Per-post "more details": adds ads watched (30d, account-wide - ads
-- aren't tied to a single post) and the creator's own outbound
-- engagement (follows/likes/comments given to others) + tips received
-- for this specific post, each with the amount earned where applicable.
CREATE OR REPLACE FUNCTION public.get_post_earning_details(p_post_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owns boolean;
  v_views bigint;
  v_likes bigint;
  v_comments bigint;
  v_ads_30d bigint;
  v_tips_amount numeric;
  v_tips_count bigint;
  v_my_follows bigint;
  v_my_likes bigint;
  v_my_comments bigint;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;
  SELECT EXISTS(SELECT 1 FROM posts WHERE id = p_post_id AND user_id = v_uid) INTO v_owns;
  IF NOT v_owns THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;

  SELECT count(*) INTO v_views FROM post_views WHERE post_id = p_post_id;
  SELECT count(*) INTO v_likes FROM post_likes WHERE post_id = p_post_id;
  SELECT count(*) INTO v_comments FROM post_comments WHERE post_id = p_post_id;

  SELECT count(*) INTO v_ads_30d FROM wallet_history
    WHERE user_id = v_uid AND type ILIKE '%ad%' AND created_at >= now() - interval '30 days';

  SELECT COALESCE(sum(creator_amount), 0), count(*) INTO v_tips_amount, v_tips_count
    FROM monetization_events WHERE post_id = p_post_id AND event_type = 'tip';

  SELECT count(*) INTO v_my_follows FROM followers WHERE follower_id = v_uid;
  SELECT count(*) INTO v_my_likes FROM post_likes WHERE user_id = v_uid;
  SELECT count(*) INTO v_my_comments FROM post_comments WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'views', v_views, 'likes', v_likes, 'comments', v_comments,
    'ads_watched_30d', v_ads_30d,
    'tips_received_count', v_tips_count, 'tips_received_amount', v_tips_amount,
    'my_follows_given', v_my_follows, 'my_likes_given', v_my_likes, 'my_comments_given', v_my_comments
  );
END;
$$;

-- ------------------------------------------------------------
-- Story earnings, same shape as post earnings but from
-- user_storylines + monetization_events.storyline_id, covering
-- both live and expired stories.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_creator_story_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT us.id AS storyline_id, us.media_url, us.media_type, us.caption, us.created_at, us.expires_at,
      (us.expires_at < now()) AS expired,
      COALESCE((SELECT sum(me.creator_amount) FROM monetization_events me WHERE me.storyline_id = us.id), 0) AS earned
    FROM user_storylines us
    WHERE us.user_id = v_uid
    ORDER BY us.created_at DESC
  ) s;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_story_earning_details(p_storyline_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owns boolean;
  v_views bigint;
  v_reactions bigint;
  v_ads_30d bigint;
  v_my_reactions_given bigint;
  v_earned numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;
  SELECT EXISTS(SELECT 1 FROM user_storylines WHERE id = p_storyline_id AND user_id = v_uid) INTO v_owns;
  IF NOT v_owns THEN RETURN jsonb_build_object('error', 'not_owner'); END IF;

  SELECT COALESCE(view_count, 0) INTO v_views FROM user_storylines WHERE id = p_storyline_id;
  SELECT count(*) INTO v_reactions FROM storyline_reactions WHERE storyline_id = p_storyline_id;

  SELECT count(*) INTO v_ads_30d FROM wallet_history
    WHERE user_id = v_uid AND type ILIKE '%ad%' AND created_at >= now() - interval '30 days';

  -- How many times this creator has reacted on OTHER users' storylines
  -- (there is no per-viewer storyline view log yet - user_storylines.view_count
  -- is a lifetime counter with no per-user record - so "times viewed on
  -- others' storylines" cannot be reported until that is built separately).
  SELECT count(*) INTO v_my_reactions_given
    FROM storyline_reactions sr JOIN user_storylines us ON us.id = sr.storyline_id
    WHERE sr.user_id = v_uid AND us.user_id <> v_uid;

  SELECT COALESCE(sum(creator_amount), 0) INTO v_earned
    FROM monetization_events WHERE storyline_id = p_storyline_id;

  RETURN jsonb_build_object(
    'views', v_views, 'reactions', v_reactions, 'ads_watched_30d', v_ads_30d,
    'my_reactions_given_on_others', v_my_reactions_given,
    'earned', v_earned
  );
END;
$$;

-- ------------------------------------------------------------
-- Task earnings: real data from offer_task_completions, the table
-- actually written to by claim_platform_task / credit_offer_completion
-- for both internal (CUSTOM) and external network tasks. "started"
-- rows are shown as pending/unclaimed; "completed" rows are already
-- credited (stars_credited / naira_credited on the row itself).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_creator_task_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_completed jsonb;
  v_pending jsonb;
  v_total_stars integer;
  v_total_naira numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error', 'not_authenticated'); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.completed_at DESC), '[]'::jsonb) INTO v_completed
  FROM (
    SELECT task_title, provider, stars_credited, naira_credited, completed_at
    FROM offer_task_completions WHERE user_id = v_uid AND status = 'completed'
  ) s;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.created_at DESC), '[]'::jsonb) INTO v_pending
  FROM (
    SELECT task_title, provider, created_at
    FROM offer_task_completions WHERE user_id = v_uid AND status = 'started'
  ) s;

  SELECT COALESCE(sum(stars_credited), 0), COALESCE(sum(naira_credited), 0)
    INTO v_total_stars, v_total_naira
    FROM offer_task_completions WHERE user_id = v_uid AND status = 'completed';

  RETURN jsonb_build_object(
    'completed', v_completed, 'pending', v_pending,
    'total_stars_claimed', v_total_stars, 'total_naira_earned', v_total_naira
  );
END;
$$;

-- ------------------------------------------------------------
-- Re-assert realtime publication membership. This is idempotent
-- and safe to re-run; it exists so live balance/earnings updates
-- (e.g. the Monetization card's Tips figure, and wallet balance
-- displays elsewhere) actually reflect changes the moment they
-- happen, instead of requiring a page reload.
-- ------------------------------------------------------------
ALTER TABLE public.monetization_events REPLICA IDENTITY FULL;
ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_history REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.monetization_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_history; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

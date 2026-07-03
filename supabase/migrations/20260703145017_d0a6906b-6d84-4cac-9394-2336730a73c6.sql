
-- Slice 1: monetization foundation

-- 1. Extend user_profiles with level, ban, and progress counters
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS monetization_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earning_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_earn_progress bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS story_earn_progress bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_spend boolean NOT NULL DEFAULT true;

-- 2. Extend post_views to gate first-view charging
ALTER TABLE public.post_views
  ADD COLUMN IF NOT EXISTS is_first_view boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stars_charged integer NOT NULL DEFAULT 0;

-- Ensure uniqueness of (post_id, user_id) so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS post_views_post_user_unique
  ON public.post_views(post_id, user_id);

-- 3. Ledger for every monetization event (charge/split accounting)
CREATE TABLE IF NOT EXISTS public.monetization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- first_view | tip | like_earn | comment_earn | story_first_view
  post_id text,
  storyline_id uuid,
  viewer_id uuid,
  creator_id uuid,
  musician_id uuid,
  stars_spent integer NOT NULL DEFAULT 0,
  ngn_gross numeric NOT NULL DEFAULT 0,
  creator_amount numeric NOT NULL DEFAULT 0,
  viewer_cashback numeric NOT NULL DEFAULT 0,
  musician_amount numeric NOT NULL DEFAULT 0,
  platform_amount numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.monetization_events TO authenticated;
GRANT ALL ON public.monetization_events TO service_role;

ALTER TABLE public.monetization_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own monetization events"
  ON public.monetization_events FOR SELECT TO authenticated
  USING (viewer_id = auth.uid() OR creator_id = auth.uid() OR musician_id = auth.uid());

CREATE POLICY "Admins see all monetization events"
  ON public.monetization_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS monetization_events_creator_idx ON public.monetization_events(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS monetization_events_viewer_idx ON public.monetization_events(viewer_id, created_at DESC);

-- 4. Seed admin_settings with tunable monetization config
INSERT INTO public.admin_settings (setting_key, setting_value, setting_type, description) VALUES
  ('star_to_ngn_rate', '300', 'number', 'NGN value of 1 Star'),
  ('split_creator_pct', '40', 'number', 'Creator share when no music'),
  ('split_creator_music_pct', '30', 'number', 'Creator share when music used'),
  ('split_musician_pct', '10', 'number', 'Musician share when music used'),
  ('split_viewer_cashback_pct', '35', 'number', 'Viewer cashback share'),
  ('split_platform_pct', '25', 'number', 'Platform share'),
  ('like_fee_ngn', '2.00', 'number', 'Like fee in NGN (Level 3 only)'),
  ('comment_fee_ngn', '2.00', 'number', 'Comment fee in NGN (Level 3 only)'),
  ('first_view_stars', '1', 'number', 'Stars auto-charged on a viewer''s first view of a post'),
  ('view_earn_threshold', '1000000', 'number', 'First-view events required to unlock VIEW EARN'),
  ('story_earn_threshold', '10000', 'number', 'First-view events required to unlock STORY EARN'),
  ('level1_followers', '100', 'number', 'Followers required for Level 1'),
  ('level1_reactions', '500', 'number', 'Reactions required for Level 1'),
  ('level2_followers', '500', 'number', 'Followers required for Level 2'),
  ('level2_reactions', '2000', 'number', 'Reactions required for Level 2'),
  ('level3_followers', '1000', 'number', 'Followers required for Level 3')
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Helper to read numeric admin_settings
CREATE OR REPLACE FUNCTION public.get_admin_setting_num(p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT setting_value::numeric FROM public.admin_settings WHERE setting_key = p_key), p_default);
$$;

-- 6. RPC: record_post_first_view — idempotent per (viewer, post)
CREATE OR REPLACE FUNCTION public.record_post_first_view(p_post_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_post record;
  v_already boolean;
  v_stars integer;
  v_star_ngn numeric;
  v_gross numeric;
  v_creator_pct numeric;
  v_musician_pct numeric;
  v_viewer_pct numeric;
  v_platform_pct numeric;
  v_creator_amt numeric;
  v_musician_amt numeric;
  v_viewer_amt numeric;
  v_platform_amt numeric;
  v_musician_id uuid;
  v_viewer_stars integer;
  v_auto_spend boolean;
  v_creator_banned boolean;
  v_creator_level smallint;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', '1', true);

  SELECT id, user_id, music_track_id INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'post_not_found');
  END IF;

  -- self-view: record but do not charge
  IF v_post.user_id = v_viewer THEN
    INSERT INTO public.post_views(post_id, user_id, is_first_view, stars_charged)
    VALUES (p_post_id, v_viewer, true, 0)
    ON CONFLICT (post_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'charged', false, 'reason', 'self_view');
  END IF;

  -- Check if this viewer already viewed this post
  SELECT EXISTS(SELECT 1 FROM public.post_views WHERE post_id = p_post_id AND user_id = v_viewer) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'charged', false, 'first_view', false, 'reason', 'already_viewed');
  END IF;

  -- Read viewer preferences + balance
  SELECT COALESCE(star_balance,0), COALESCE(auto_spend, true)
    INTO v_viewer_stars, v_auto_spend
    FROM public.user_profiles WHERE id = v_viewer;

  v_stars := public.get_admin_setting_num('first_view_stars', 1)::integer;

  -- If auto-spend off or insufficient stars → record free first view only
  IF NOT v_auto_spend OR v_viewer_stars < v_stars THEN
    INSERT INTO public.post_views(post_id, user_id, is_first_view, stars_charged)
    VALUES (p_post_id, v_viewer, true, 0)
    ON CONFLICT (post_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'charged', false, 'first_view', true,
      'reason', CASE WHEN NOT v_auto_spend THEN 'auto_spend_off' ELSE 'insufficient_stars' END);
  END IF;

  -- Creator ban check → still record free first view (no charge)
  SELECT COALESCE(earning_banned,false), COALESCE(monetization_level,0)
    INTO v_creator_banned, v_creator_level
    FROM public.user_profiles WHERE id = v_post.user_id;

  IF v_creator_banned OR v_creator_level = 0 THEN
    INSERT INTO public.post_views(post_id, user_id, is_first_view, stars_charged)
    VALUES (p_post_id, v_viewer, true, 0)
    ON CONFLICT (post_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'charged', false, 'first_view', true, 'reason', 'creator_not_monetized');
  END IF;

  -- Compute split
  v_star_ngn := public.get_admin_setting_num('star_to_ngn_rate', 300);
  v_gross := v_stars * v_star_ngn;

  IF v_post.music_track_id IS NOT NULL THEN
    SELECT artist_id INTO v_musician_id FROM public.music_tracks WHERE id = v_post.music_track_id;
    v_creator_pct := public.get_admin_setting_num('split_creator_music_pct', 30);
    v_musician_pct := public.get_admin_setting_num('split_musician_pct', 10);
  ELSE
    v_creator_pct := public.get_admin_setting_num('split_creator_pct', 40);
    v_musician_pct := 0;
  END IF;
  v_viewer_pct := public.get_admin_setting_num('split_viewer_cashback_pct', 35);
  v_platform_pct := public.get_admin_setting_num('split_platform_pct', 25);

  v_creator_amt := v_gross * v_creator_pct / 100;
  v_musician_amt := v_gross * v_musician_pct / 100;
  v_viewer_amt := v_gross * v_viewer_pct / 100;
  v_platform_amt := v_gross * v_platform_pct / 100;

  -- Charge viewer stars
  UPDATE public.user_profiles
     SET star_balance = star_balance - v_stars,
         wallet_balance = COALESCE(wallet_balance,0) + v_viewer_amt,
         updated_at = now()
   WHERE id = v_viewer;

  -- Credit creator wallet
  UPDATE public.user_profiles
     SET wallet_balance = COALESCE(wallet_balance,0) + v_creator_amt,
         total_earned = COALESCE(total_earned,0) + v_creator_amt,
         view_earn_progress = COALESCE(view_earn_progress,0) + 1,
         updated_at = now()
   WHERE id = v_post.user_id;

  -- Credit musician if any
  IF v_musician_id IS NOT NULL AND v_musician_amt > 0 THEN
    UPDATE public.user_profiles
       SET wallet_balance = COALESCE(wallet_balance,0) + v_musician_amt,
           total_earned = COALESCE(total_earned,0) + v_musician_amt,
           updated_at = now()
     WHERE id = v_musician_id;
  END IF;

  -- Log post_view (first)
  INSERT INTO public.post_views(post_id, user_id, is_first_view, stars_charged)
  VALUES (p_post_id, v_viewer, true, v_stars)
  ON CONFLICT (post_id, user_id) DO NOTHING;

  -- Log wallet history entries (used by transaction UI)
  INSERT INTO public.wallet_history(user_id, type, amount, currency, meta) VALUES
    (v_viewer, 'view_charge', -v_stars, 'STARS', jsonb_build_object('post_id', p_post_id)),
    (v_viewer, 'view_cashback', v_viewer_amt, 'NGN', jsonb_build_object('post_id', p_post_id)),
    (v_post.user_id, 'view_earn', v_creator_amt, 'NGN', jsonb_build_object('post_id', p_post_id, 'viewer_id', v_viewer));
  IF v_musician_id IS NOT NULL AND v_musician_amt > 0 THEN
    INSERT INTO public.wallet_history(user_id, type, amount, currency, meta)
    VALUES (v_musician_id, 'music_royalty', v_musician_amt, 'NGN', jsonb_build_object('post_id', p_post_id));
  END IF;

  -- Ledger
  INSERT INTO public.monetization_events(event_type, post_id, viewer_id, creator_id, musician_id, stars_spent, ngn_gross, creator_amount, viewer_cashback, musician_amount, platform_amount, meta)
  VALUES ('first_view', p_post_id, v_viewer, v_post.user_id, v_musician_id, v_stars, v_gross, v_creator_amt, v_viewer_amt, v_musician_amt, v_platform_amt, '{}'::jsonb);

  RETURN jsonb_build_object(
    'success', true,
    'charged', true,
    'first_view', true,
    'stars_spent', v_stars,
    'creator_amount', v_creator_amt,
    'viewer_cashback', v_viewer_amt,
    'musician_amount', v_musician_amt
  );
END;
$$;

-- 7. RPC: tip_post — fixed amounts 5/10/20/50/100
CREATE OR REPLACE FUNCTION public.tip_post(p_post_id text, p_stars integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_post record;
  v_musician_id uuid;
  v_star_ngn numeric;
  v_gross numeric;
  v_creator_pct numeric;
  v_musician_pct numeric;
  v_viewer_pct numeric;
  v_platform_pct numeric;
  v_creator_amt numeric;
  v_musician_amt numeric;
  v_viewer_amt numeric;
  v_platform_amt numeric;
  v_viewer_stars integer;
  v_creator_banned boolean;
  v_creator_level smallint;
BEGIN
  IF v_viewer IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF p_stars NOT IN (5,10,20,50,100) THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_amount'); END IF;

  PERFORM set_config('app.bypass_profile_protection', '1', true);

  SELECT id, user_id, music_track_id INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'post_not_found'); END IF;
  IF v_post.user_id = v_viewer THEN RETURN jsonb_build_object('success', false, 'error', 'cannot_tip_self'); END IF;

  SELECT COALESCE(earning_banned,false), COALESCE(monetization_level,0) INTO v_creator_banned, v_creator_level
    FROM public.user_profiles WHERE id = v_post.user_id;
  IF v_creator_banned OR v_creator_level = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'creator_not_monetized');
  END IF;

  SELECT COALESCE(star_balance,0) INTO v_viewer_stars FROM public.user_profiles WHERE id = v_viewer;
  IF v_viewer_stars < p_stars THEN RETURN jsonb_build_object('success', false, 'error', 'insufficient_stars'); END IF;

  v_star_ngn := public.get_admin_setting_num('star_to_ngn_rate', 300);
  v_gross := p_stars * v_star_ngn;

  IF v_post.music_track_id IS NOT NULL THEN
    SELECT artist_id INTO v_musician_id FROM public.music_tracks WHERE id = v_post.music_track_id;
    v_creator_pct := public.get_admin_setting_num('split_creator_music_pct', 30);
    v_musician_pct := public.get_admin_setting_num('split_musician_pct', 10);
  ELSE
    v_creator_pct := public.get_admin_setting_num('split_creator_pct', 40);
    v_musician_pct := 0;
  END IF;
  v_viewer_pct := public.get_admin_setting_num('split_viewer_cashback_pct', 35);
  v_platform_pct := public.get_admin_setting_num('split_platform_pct', 25);

  v_creator_amt := v_gross * v_creator_pct / 100;
  v_musician_amt := v_gross * v_musician_pct / 100;
  v_viewer_amt := v_gross * v_viewer_pct / 100;
  v_platform_amt := v_gross * v_platform_pct / 100;

  UPDATE public.user_profiles
     SET star_balance = star_balance - p_stars,
         wallet_balance = COALESCE(wallet_balance,0) + v_viewer_amt,
         updated_at = now()
   WHERE id = v_viewer;

  UPDATE public.user_profiles
     SET wallet_balance = COALESCE(wallet_balance,0) + v_creator_amt,
         total_earned = COALESCE(total_earned,0) + v_creator_amt,
         updated_at = now()
   WHERE id = v_post.user_id;

  IF v_musician_id IS NOT NULL AND v_musician_amt > 0 THEN
    UPDATE public.user_profiles
       SET wallet_balance = COALESCE(wallet_balance,0) + v_musician_amt,
           total_earned = COALESCE(total_earned,0) + v_musician_amt,
           updated_at = now()
     WHERE id = v_musician_id;
  END IF;

  INSERT INTO public.wallet_history(user_id, type, amount, currency, meta) VALUES
    (v_viewer, 'tip_sent', -p_stars, 'STARS', jsonb_build_object('post_id', p_post_id)),
    (v_viewer, 'tip_cashback', v_viewer_amt, 'NGN', jsonb_build_object('post_id', p_post_id)),
    (v_post.user_id, 'tip_received', v_creator_amt, 'NGN', jsonb_build_object('post_id', p_post_id, 'viewer_id', v_viewer, 'stars', p_stars));
  IF v_musician_id IS NOT NULL AND v_musician_amt > 0 THEN
    INSERT INTO public.wallet_history(user_id, type, amount, currency, meta)
    VALUES (v_musician_id, 'music_royalty', v_musician_amt, 'NGN', jsonb_build_object('post_id', p_post_id, 'source', 'tip'));
  END IF;

  INSERT INTO public.monetization_events(event_type, post_id, viewer_id, creator_id, musician_id, stars_spent, ngn_gross, creator_amount, viewer_cashback, musician_amount, platform_amount, meta)
  VALUES ('tip', p_post_id, v_viewer, v_post.user_id, v_musician_id, p_stars, v_gross, v_creator_amt, v_viewer_amt, v_musician_amt, v_platform_amt, '{}'::jsonb);

  INSERT INTO public.user_notifications(user_id, title, message, type, notification_category, action_data)
  VALUES (v_post.user_id, 'You got a tip! 💫', format('Someone tipped you %s Stars (₦%s)', p_stars, v_creator_amt), 'success', 'tip', jsonb_build_object('post_id', p_post_id, 'stars', p_stars));

  RETURN jsonb_build_object('success', true, 'stars_spent', p_stars, 'creator_amount', v_creator_amt, 'viewer_cashback', v_viewer_amt);
END;
$$;

-- 8. Trigger: auto-promote monetization level based on followers + reactions
CREATE OR REPLACE FUNCTION public.recompute_monetization_level()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l1_f numeric := public.get_admin_setting_num('level1_followers', 100);
  v_l1_r numeric := public.get_admin_setting_num('level1_reactions', 500);
  v_l2_f numeric := public.get_admin_setting_num('level2_followers', 500);
  v_l2_r numeric := public.get_admin_setting_num('level2_reactions', 2000);
  v_l3_f numeric := public.get_admin_setting_num('level3_followers', 1000);
  v_new_level smallint := 0;
BEGIN
  IF COALESCE(NEW.follower_count,0) >= v_l3_f THEN v_new_level := 3;
  ELSIF COALESCE(NEW.follower_count,0) >= v_l2_f AND COALESCE(NEW.total_reactions,0) >= v_l2_r THEN v_new_level := 2;
  ELSIF COALESCE(NEW.follower_count,0) >= v_l1_f AND COALESCE(NEW.total_reactions,0) >= v_l1_r THEN v_new_level := 1;
  END IF;
  IF v_new_level <> COALESCE(NEW.monetization_level,0) THEN
    NEW.monetization_level := v_new_level;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_monetization_level ON public.user_profiles;
CREATE TRIGGER trg_recompute_monetization_level
BEFORE UPDATE OF follower_count, total_reactions ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.recompute_monetization_level();

-- 9. Enable realtime on user_profiles + wallet_history so UI updates without reload
ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.wallet_history REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_history;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

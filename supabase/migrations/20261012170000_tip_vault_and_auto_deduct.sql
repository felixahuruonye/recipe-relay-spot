
-- Auto-deduct preference on profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS auto_deduct_stars integer NOT NULL DEFAULT 1;

-- Tip vault / ledger (admin-visible history of every tip split)
CREATE TABLE IF NOT EXISTS public.tip_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  stars integer NOT NULL,
  star_to_ngn_rate numeric NOT NULL DEFAULT 300,
  amount_ngn numeric NOT NULL DEFAULT 0,
  creator_pct numeric NOT NULL DEFAULT 0,
  musician_pct numeric NOT NULL DEFAULT 0,
  viewer_pct numeric NOT NULL DEFAULT 0,
  platform_pct numeric NOT NULL DEFAULT 0,
  creator_ngn numeric NOT NULL DEFAULT 0,
  musician_ngn numeric NOT NULL DEFAULT 0,
  viewer_ngn numeric NOT NULL DEFAULT 0,
  platform_ngn numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  music_track_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tip_ledger_created_at_idx ON public.tip_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS tip_ledger_to_user_idx ON public.tip_ledger (to_user_id);
CREATE INDEX IF NOT EXISTS tip_ledger_from_user_idx ON public.tip_ledger (from_user_id);

ALTER TABLE public.tip_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read tip_ledger" ON public.tip_ledger;
CREATE POLICY "Admins read tip_ledger" ON public.tip_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Creators read own tip earnings" ON public.tip_ledger;
CREATE POLICY "Creators read own tip earnings" ON public.tip_ledger
  FOR SELECT USING (to_user_id = auth.uid());

-- Ensure admin_settings rate keys exist (no level thresholds)
INSERT INTO public.admin_settings (setting_key, setting_value, description)
VALUES
  ('star_to_ngn_rate', '300', 'NGN value of 1 Star'),
  ('split_creator_pct', '40', 'Creator share when no music'),
  ('split_creator_music_pct', '30', 'Creator share when music used'),
  ('split_musician_pct', '10', 'Musician share when music used'),
  ('split_viewer_cashback_pct', '35', 'Viewer cashback share'),
  ('split_platform_pct', '25', 'Platform share')
ON CONFLICT (setting_key) DO NOTHING;

-- Universal tip_post: works for ALL posts (not only monetized)
CREATE OR REPLACE FUNCTION public.tip_post(p_post_id uuid, p_stars integer, p_source text DEFAULT 'manual')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_post record;
  v_bal integer;
  v_rate numeric;
  v_creator_pct numeric;
  v_creator_music_pct numeric;
  v_musician_pct numeric;
  v_viewer_pct numeric;
  v_platform_pct numeric;
  v_has_music boolean;
  v_c_pct numeric;
  v_m_pct numeric;
  v_total_ngn numeric;
  v_creator_ngn numeric;
  v_musician_ngn numeric;
  v_viewer_ngn numeric;
  v_platform_ngn numeric;
  v_musician_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_stars IS NULL OR p_stars < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid star amount');
  END IF;

  SELECT * INTO v_post FROM posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Post not found');
  END IF;
  IF v_post.user_id = v_uid THEN
    RETURN json_build_object('success', false, 'error', 'Cannot tip your own post');
  END IF;

  SELECT COALESCE(star_balance, 0) INTO v_bal FROM user_profiles WHERE id = v_uid;
  IF v_bal < p_stars THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient stars');
  END IF;

  SELECT COALESCE(setting_value::numeric, 300) INTO v_rate FROM admin_settings WHERE setting_key = 'star_to_ngn_rate';
  SELECT COALESCE(setting_value::numeric, 40) INTO v_creator_pct FROM admin_settings WHERE setting_key = 'split_creator_pct';
  SELECT COALESCE(setting_value::numeric, 30) INTO v_creator_music_pct FROM admin_settings WHERE setting_key = 'split_creator_music_pct';
  SELECT COALESCE(setting_value::numeric, 10) INTO v_musician_pct FROM admin_settings WHERE setting_key = 'split_musician_pct';
  SELECT COALESCE(setting_value::numeric, 35) INTO v_viewer_pct FROM admin_settings WHERE setting_key = 'split_viewer_cashback_pct';
  SELECT COALESCE(setting_value::numeric, 25) INTO v_platform_pct FROM admin_settings WHERE setting_key = 'split_platform_pct';

  v_has_music := (v_post.music_track_id IS NOT NULL);
  IF v_has_music THEN
    v_c_pct := v_creator_music_pct;
    v_m_pct := v_musician_pct;
    SELECT artist_id INTO v_musician_id FROM music_tracks WHERE id = v_post.music_track_id;
  ELSE
    v_c_pct := v_creator_pct;
    v_m_pct := 0;
    v_musician_id := NULL;
  END IF;

  v_total_ngn := p_stars * COALESCE(v_rate, 300);
  v_creator_ngn := round(v_total_ngn * v_c_pct / 100.0, 2);
  v_musician_ngn := round(v_total_ngn * v_m_pct / 100.0, 2);
  v_viewer_ngn := round(v_total_ngn * v_viewer_pct / 100.0, 2);
  v_platform_ngn := round(v_total_ngn * v_platform_pct / 100.0, 2);

  -- Deduct stars from tipper
  UPDATE user_profiles
  SET star_balance = GREATEST(0, COALESCE(star_balance, 0) - p_stars)
  WHERE id = v_uid;

  -- Credit creator wallet (naira balance if column exists)
  BEGIN
    UPDATE user_profiles
    SET tip_earnings = COALESCE(tip_earnings, 0) + v_creator_ngn,
        total_earned = COALESCE(total_earned, 0) + v_creator_ngn
    WHERE id = v_post.user_id;
  EXCEPTION WHEN undefined_column THEN
    UPDATE user_profiles
    SET total_earned = COALESCE(total_earned, 0) + v_creator_ngn
    WHERE id = v_post.user_id;
  END;

  -- Credit musician if any
  IF v_musician_id IS NOT NULL AND v_musician_ngn > 0 THEN
    BEGIN
      UPDATE user_profiles
      SET tip_earnings = COALESCE(tip_earnings, 0) + v_musician_ngn,
          total_earned = COALESCE(total_earned, 0) + v_musician_ngn
      WHERE id = v_musician_id;
    EXCEPTION WHEN undefined_column THEN
      UPDATE user_profiles
      SET total_earned = COALESCE(total_earned, 0) + v_musician_ngn
      WHERE id = v_musician_id;
    END;
  END IF;

  -- Viewer cashback into wallet if column exists
  BEGIN
    UPDATE user_profiles
    SET wallet_balance = COALESCE(wallet_balance, 0) + v_viewer_ngn
    WHERE id = v_uid;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  INSERT INTO tip_ledger (
    post_id, from_user_id, to_user_id, stars, star_to_ngn_rate, amount_ngn,
    creator_pct, musician_pct, viewer_pct, platform_pct,
    creator_ngn, musician_ngn, viewer_ngn, platform_ngn,
    source, music_track_id
  ) VALUES (
    p_post_id, v_uid, v_post.user_id, p_stars, v_rate, v_total_ngn,
    v_c_pct, v_m_pct, v_viewer_pct, v_platform_pct,
    v_creator_ngn, v_musician_ngn, v_viewer_ngn, v_platform_ngn,
    COALESCE(p_source, 'manual'), v_post.music_track_id
  );

  RETURN json_build_object(
    'success', true,
    'viewer_cashback', v_viewer_ngn,
    'creator_amount', v_creator_ngn,
    'platform_amount', v_platform_ngn,
    'musician_amount', v_musician_ngn,
    'rate', v_rate
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.tip_post(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tip_post(uuid, integer) TO authenticated;

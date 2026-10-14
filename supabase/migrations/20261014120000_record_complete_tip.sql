-- Fix tip flow: add status column + record_complete_tip RPC expected by the feed

-- 1) status on tip_ledger (frontend + wallet history expect it)
ALTER TABLE public.tip_ledger
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS tip_ledger_status_idx ON public.tip_ledger (status);

-- 2) Ensure pending_tip_earnings exists on profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS pending_tip_earnings numeric NOT NULL DEFAULT 0;

-- 3) Atomic tip recorder matching frontend executeTip contract
CREATE OR REPLACE FUNCTION public.record_complete_tip(
  p_post_id uuid,
  p_to_user_id uuid,
  p_stars integer,
  p_source text DEFAULT 'manual',
  p_viewer_ngn numeric DEFAULT 0,
  p_creator_ngn numeric DEFAULT 0,
  p_musician_ngn numeric DEFAULT 0,
  p_platform_ngn numeric DEFAULT 0,
  p_rate numeric DEFAULT 300,
  p_creator_pct numeric DEFAULT 40,
  p_viewer_pct numeric DEFAULT 35,
  p_platform_pct numeric DEFAULT 25,
  p_musician_pct numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_bal integer;
  v_music uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_stars IS NULL OR p_stars < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid star amount');
  END IF;
  IF p_to_user_id IS NULL OR p_to_user_id = v_uid THEN
    RETURN json_build_object('success', false, 'error', 'Invalid recipient');
  END IF;

  SELECT COALESCE(star_balance, 0) INTO v_bal FROM user_profiles WHERE id = v_uid FOR UPDATE;
  IF v_bal < p_stars THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient stars');
  END IF;

  SELECT music_track_id INTO v_music FROM posts WHERE id = p_post_id;

  -- Deduct stars from tipper
  UPDATE user_profiles
  SET star_balance = GREATEST(0, COALESCE(star_balance, 0) - p_stars),
      pending_tip_earnings = COALESCE(pending_tip_earnings, 0) + COALESCE(p_viewer_ngn, 0)
  WHERE id = v_uid;

  -- Credit creator pending earnings
  UPDATE user_profiles
  SET pending_tip_earnings = COALESCE(pending_tip_earnings, 0) + COALESCE(p_creator_ngn, 0)
  WHERE id = p_to_user_id;

  -- Credit musician pending if any
  IF p_musician_ngn > 0 AND v_music IS NOT NULL THEN
    UPDATE user_profiles up
    SET pending_tip_earnings = COALESCE(up.pending_tip_earnings, 0) + p_musician_ngn
    FROM music_tracks mt
    WHERE mt.id = v_music AND up.id = mt.artist_id;
  END IF;

  INSERT INTO tip_ledger (
    post_id, from_user_id, to_user_id, stars, star_to_ngn_rate, amount_ngn,
    creator_pct, musician_pct, viewer_pct, platform_pct,
    creator_ngn, musician_ngn, viewer_ngn, platform_ngn,
    source, music_track_id, status
  ) VALUES (
    p_post_id, v_uid, p_to_user_id, p_stars, COALESCE(p_rate, 300),
    p_stars * COALESCE(p_rate, 300),
    COALESCE(p_creator_pct, 0), COALESCE(p_musician_pct, 0),
    COALESCE(p_viewer_pct, 0), COALESCE(p_platform_pct, 0),
    COALESCE(p_creator_ngn, 0), COALESCE(p_musician_ngn, 0),
    COALESCE(p_viewer_ngn, 0), COALESCE(p_platform_ngn, 0),
    COALESCE(p_source, 'manual'), v_music, 'pending'
  );

  -- Best-effort wallet_history for viewer cashback
  BEGIN
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (
      v_uid,
      'tip_cashback',
      COALESCE(p_viewer_ngn, 0),
      'NGN',
      jsonb_build_object(
        'post_id', p_post_id,
        'stars', p_stars,
        'status', 'pending',
        'creator_id', p_to_user_id,
        'creator_ngn', p_creator_ngn,
        'label', format('Cashback pending ⭐%s', p_stars)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'viewer_cashback', COALESCE(p_viewer_ngn, 0),
    'creator_amount', COALESCE(p_creator_ngn, 0),
    'platform_amount', COALESCE(p_platform_ngn, 0),
    'musician_amount', COALESCE(p_musician_ngn, 0),
    'rate', COALESCE(p_rate, 300)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.record_complete_tip(
  uuid, uuid, integer, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;

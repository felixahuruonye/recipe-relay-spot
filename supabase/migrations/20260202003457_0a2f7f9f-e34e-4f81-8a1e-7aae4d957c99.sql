-- Fix: process_story_view should not error for users without a user_profiles row.
-- Treat missing profile as 0 stars and still record the view (no earnings).

CREATE OR REPLACE FUNCTION public.process_story_view(p_story_id text, p_viewer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_story RECORD;
  v_view_exists boolean;
  v_viewer_stars bigint;
  v_viewer_profile_exists boolean;
  v_uploader uuid;
  v_price bigint;
  uploader_share numeric;
  viewer_share numeric;
  platform_share numeric;
  star_value numeric := 500;
BEGIN
  SELECT id, user_id, star_price, view_count
  INTO v_story
  FROM public.user_storylines
  WHERE id = p_story_id::uuid AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Story not found');
  END IF;

  v_uploader := v_story.user_id;
  v_price := COALESCE(v_story.star_price, 0);

  -- Prevent double earning / double charging
  SELECT EXISTS (
    SELECT 1 FROM public.story_views
    WHERE story_id = p_story_id::uuid AND viewer_id = p_viewer_id
  ) INTO v_view_exists;

  IF v_view_exists THEN
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  END IF;

  -- Free or own story: record view only
  IF v_price <= 0 OR v_uploader = p_viewer_id THEN
    INSERT INTO public.story_views (story_id, viewer_id, stars_spent)
    VALUES (p_story_id::uuid, p_viewer_id, 0);

    UPDATE public.user_storylines
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_story_id::uuid;

    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', false, 'free', true);
  END IF;

  -- Check if viewer profile exists; missing profile is treated as 0 stars.
  SELECT EXISTS(
    SELECT 1 FROM public.user_profiles WHERE id = p_viewer_id
  ) INTO v_viewer_profile_exists;

  IF v_viewer_profile_exists THEN
    SELECT COALESCE(star_balance, 0) INTO v_viewer_stars
    FROM public.user_profiles
    WHERE id = p_viewer_id;
  ELSE
    v_viewer_stars := 0;
  END IF;

  -- If user has no/insufficient stars (or missing profile): allow viewing but no earnings
  IF v_viewer_stars < v_price THEN
    INSERT INTO public.story_views (story_id, viewer_id, stars_spent)
    VALUES (p_story_id::uuid, p_viewer_id, 0);

    UPDATE public.user_storylines
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_story_id::uuid;

    RETURN json_build_object(
      'success', true,
      'charged', false,
      'insufficient_stars', true,
      'profile_missing', (NOT v_viewer_profile_exists),
      'required', v_price,
      'available', v_viewer_stars,
      'viewer_earn', 0,
      'uploader_earn', 0,
      'stars_spent', 0
    );
  END IF;

  -- Calculate earnings (NGN)
  uploader_share := v_price * star_value * 0.40;
  viewer_share := v_price * star_value * 0.35;
  platform_share := v_price * star_value * 0.25;

  -- Deduct stars from viewer
  UPDATE public.user_profiles
  SET star_balance = star_balance - v_price
  WHERE id = p_viewer_id;

  -- Credit uploader wallet
  UPDATE public.user_profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + uploader_share,
      total_earned = COALESCE(total_earned, 0) + uploader_share
  WHERE id = v_uploader;

  -- Credit viewer wallet (cashback)
  UPDATE public.user_profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + viewer_share
  WHERE id = p_viewer_id;

  -- Record view
  INSERT INTO public.story_views (story_id, viewer_id, stars_spent)
  VALUES (p_story_id::uuid, p_viewer_id, v_price);

  -- Update view count
  UPDATE public.user_storylines
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_story_id::uuid;

  -- Record wallet history
  INSERT INTO public.wallet_history (user_id, type, amount, currency, meta) VALUES
    (v_uploader, 'story_earn', uploader_share, 'NGN', jsonb_build_object('story_id', p_story_id, 'stars_spent', v_price, 'viewer_id', p_viewer_id::text)),
    (p_viewer_id, 'story_cashback', viewer_share, 'NGN', jsonb_build_object('story_id', p_story_id, 'stars_spent', v_price));

  -- Record transaction
  INSERT INTO public.view_transactions (story_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
  VALUES (p_story_id::uuid, p_viewer_id, v_uploader, v_price, uploader_share, viewer_share, platform_share);

  -- Notify users
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES
    (v_uploader, 'Story Earned! ⭐', format('You earned ₦%s from your story!', uploader_share), 'success', 'story_earn', jsonb_build_object('story_id', p_story_id, 'amount', uploader_share)),
    (p_viewer_id, 'Cashback! 💰', format('You earned ₦%s cashback!', viewer_share), 'success', 'story_cashback', jsonb_build_object('story_id', p_story_id, 'amount', viewer_share));

  RETURN json_build_object(
    'success', true,
    'viewer_earn', viewer_share,
    'uploader_earn', uploader_share,
    'platform_earn', platform_share,
    'charged', true,
    'stars_spent', v_price
  );
END;
$function$;

-- Update monetization splits everywhere: creator 40%, viewer cashback 35%, platform 25%

CREATE OR REPLACE FUNCTION public.process_post_view(p_post_id text, p_viewer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_post RECORD;
  v_view_exists boolean;
  v_viewer_stars bigint;
  v_uploader uuid;
  v_price bigint;
  uploader_share numeric;
  viewer_share numeric;
  platform_share numeric;
  star_value numeric := 500;
BEGIN
  SELECT id, user_id, star_price
  INTO v_post
  FROM public.posts
  WHERE id = p_post_id AND status = 'approved';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Post not found');
  END IF;

  v_uploader := v_post.user_id;
  v_price := COALESCE(v_post.star_price, 0);

  -- Prevent double earning / double charging
  SELECT EXISTS (
    SELECT 1 FROM public.post_views
    WHERE post_id = p_post_id AND user_id = p_viewer_id
  ) INTO v_view_exists;

  IF v_view_exists THEN
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  END IF;

  -- Free or own post: record view only
  IF v_price <= 0 OR v_uploader = p_viewer_id THEN
    INSERT INTO public.post_views (post_id, user_id) VALUES (p_post_id, p_viewer_id);
    UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', false, 'free', true);
  END IF;

  -- Check star balance
  SELECT COALESCE(star_balance, 0) INTO v_viewer_stars
  FROM public.user_profiles
  WHERE id = p_viewer_id;

  -- If user has no/insufficient stars: allow viewing but no earnings
  IF v_viewer_stars < v_price THEN
    INSERT INTO public.post_views (post_id, user_id) VALUES (p_post_id, p_viewer_id);
    UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;

    RETURN json_build_object(
      'success', true,
      'charged', false,
      'insufficient_stars', true,
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
  UPDATE public.user_profiles SET star_balance = star_balance - v_price WHERE id = p_viewer_id;

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
  INSERT INTO public.post_views (post_id, user_id) VALUES (p_post_id, p_viewer_id);

  -- Update view count
  UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;

  -- Record wallet history
  INSERT INTO public.wallet_history (user_id, type, amount, currency, meta) VALUES
    (v_uploader, 'upload_earn', uploader_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'stars_spent', v_price, 'viewer_id', p_viewer_id::text)),
    (p_viewer_id, 'view_earn', viewer_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'stars_spent', v_price));

  -- Record transaction
  INSERT INTO public.view_transactions (post_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
  VALUES (p_post_id, p_viewer_id, v_uploader, v_price, uploader_share, viewer_share, platform_share);

  -- Notify users
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES
    (v_uploader, 'Post Earned! ⭐', format('You earned ₦%s from your post!', uploader_share), 'success', 'post_earn', jsonb_build_object('post_id', p_post_id, 'amount', uploader_share)),
    (p_viewer_id, 'Cashback! 💰', format('You earned ₦%s cashback!', viewer_share), 'success', 'view_cashback', jsonb_build_object('post_id', p_post_id, 'amount', viewer_share));

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

  -- Check star balance
  SELECT COALESCE(star_balance, 0) INTO v_viewer_stars
  FROM public.user_profiles
  WHERE id = p_viewer_id;

  -- If user has no/insufficient stars: allow viewing but no earnings
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


CREATE OR REPLACE FUNCTION public.process_paid_view(p_content_id text, p_content_type text, p_viewer_id uuid, p_uploader_id uuid, p_star_price integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_viewer_balance integer;
  v_uploader_share numeric;
  v_viewer_share numeric;
  v_platform_share numeric;
  v_star_value numeric := 500;
BEGIN
  SELECT star_balance INTO v_viewer_balance
  FROM user_profiles WHERE id = p_viewer_id;

  IF v_viewer_balance < p_star_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
  END IF;

  -- New split: 40/35/25
  v_uploader_share := (p_star_price * v_star_value * 0.40);
  v_viewer_share := (p_star_price * v_star_value * 0.35);
  v_platform_share := (p_star_price * v_star_value * 0.25);

  UPDATE user_profiles
  SET star_balance = star_balance - p_star_price
  WHERE id = p_viewer_id;

  UPDATE user_profiles
  SET wallet_balance = wallet_balance + v_uploader_share,
      total_earned = total_earned + v_uploader_share
  WHERE id = p_uploader_id;

  UPDATE user_profiles
  SET wallet_balance = wallet_balance + v_viewer_share
  WHERE id = p_viewer_id;

  INSERT INTO wallet_history (user_id, type, amount, meta)
  VALUES
    (p_uploader_id, 'upload_earn', v_uploader_share, jsonb_build_object('content_id', p_content_id, 'content_type', p_content_type)),
    (p_viewer_id, 'view_earn', v_viewer_share, jsonb_build_object('content_id', p_content_id, 'content_type', p_content_type));

  IF p_content_type = 'story' THEN
    INSERT INTO view_transactions (story_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
    VALUES (p_content_id::uuid, p_viewer_id, p_uploader_id, p_star_price, v_uploader_share, v_viewer_share, v_platform_share);
  ELSE
    INSERT INTO view_transactions (post_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
    VALUES (p_content_id, p_viewer_id, p_uploader_id, p_star_price, v_uploader_share, v_viewer_share, v_platform_share);
  END IF;

  INSERT INTO user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES
    (p_uploader_id, 'Earnings! 💰', format('You earned ₦%s from your %s!', v_uploader_share, p_content_type), 'success', 'earnings', jsonb_build_object('amount', v_uploader_share)),
    (p_viewer_id, 'Cashback! 🎁', format('You earned ₦%s cashback!', v_viewer_share), 'success', 'cashback', jsonb_build_object('amount', v_viewer_share));

  RETURN jsonb_build_object(
    'success', true,
    'uploader_earned', v_uploader_share,
    'viewer_earned', v_viewer_share,
    'platform_earned', v_platform_share
  );
END;
$function$;


-- Broadcast: earning split update notification to every user
INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
SELECT
  up.id,
  'Earnings Split Updated',
  'We updated earnings: Creators earn 40%, viewers get 35% cashback, platform fee is 25%.',
  'info',
  'system',
  jsonb_build_object('creator_percent', 40, 'viewer_percent', 35, 'platform_percent', 25)
FROM public.user_profiles up;
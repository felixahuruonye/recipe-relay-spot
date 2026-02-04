-- 1) Groups visibility: treat NULL is_suspended as not suspended
ALTER TABLE public.groups
  ALTER COLUMN is_suspended SET DEFAULT false;

ALTER POLICY "Users can view non-suspended groups" ON public.groups
  USING (COALESCE(is_suspended, false) = false);

-- 2) Allow *server-authorized* updates to protected profile fields (earnings, fees, credits)
--    by using a transaction-local bypass flag set inside SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.check_profile_update_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Bypass only when explicitly enabled by privileged server-side functions.
  IF current_setting('app.bypass_profile_protection', true) = '1' THEN
    RETURN NEW;
  END IF;

  -- If user is admin, allow all updates
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- For regular users, prevent changes to sensitive fields
  IF NEW.vip IS DISTINCT FROM OLD.vip OR
     NEW.is_vip IS DISTINCT FROM OLD.is_vip OR
     NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at OR
     NEW.vip_started_at IS DISTINCT FROM OLD.vip_started_at OR
     NEW.star_balance IS DISTINCT FROM OLD.star_balance OR
     NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR
     NEW.ai_credits IS DISTINCT FROM OLD.ai_credits OR
     NEW.voice_credits IS DISTINCT FROM OLD.voice_credits OR
     NEW.total_earned IS DISTINCT FROM OLD.total_earned OR
     NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR
     NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR
     NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason THEN
    RAISE EXCEPTION 'You cannot modify protected profile fields';
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Patch RPCs that legitimately change protected fields to set bypass flag

CREATE OR REPLACE FUNCTION public.process_story_view(p_story_id text, p_viewer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  -- Allow controlled updates to protected user_profiles fields in this transaction
  PERFORM set_config('app.bypass_profile_protection', '1', true);

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
$$;

CREATE OR REPLACE FUNCTION public.process_post_view(p_post_id text, p_viewer_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  PERFORM set_config('app.bypass_profile_protection', '1', true);

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
$$;

CREATE OR REPLACE FUNCTION public.process_paid_view(p_content_id text, p_content_type text, p_viewer_id uuid, p_uploader_id uuid, p_star_price integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_viewer_balance integer;
  v_uploader_share numeric;
  v_viewer_share numeric;
  v_platform_share numeric;
  v_star_value numeric := 500;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

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
$$;

CREATE OR REPLACE FUNCTION public.join_group_with_fee(p_group_id text, p_user_id uuid, p_entry_fee integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_balance integer;
  v_owner_id uuid;
  v_owner_share numeric;
  v_platform_share numeric;
  v_star_value numeric := 500;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  -- Ensure callers can only act for themselves
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_entry_fee > 0 THEN
    -- Check user's star balance
    SELECT star_balance INTO v_user_balance
    FROM user_profiles WHERE id = p_user_id;

    IF v_user_balance < p_entry_fee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
    END IF;

    -- Get group owner
    SELECT owner_id INTO v_owner_id FROM groups WHERE id = p_group_id;

    -- Calculate shares (80% owner, 20% platform)
    v_owner_share := (p_entry_fee * v_star_value * 0.80);
    v_platform_share := (p_entry_fee * v_star_value * 0.20);

    -- Deduct stars from user
    UPDATE user_profiles
    SET star_balance = star_balance - p_entry_fee
    WHERE id = p_user_id;

    -- Credit owner wallet
    UPDATE user_profiles
    SET wallet_balance = wallet_balance + v_owner_share,
        total_earned = total_earned + v_owner_share
    WHERE id = v_owner_id;

    -- Record in wallet_history
    INSERT INTO wallet_history (user_id, type, amount, meta)
    VALUES
      (v_owner_id, 'group_fee', v_owner_share, jsonb_build_object('group_id', p_group_id, 'member_id', p_user_id)),
      (p_user_id, 'group_join', -p_entry_fee * v_star_value, jsonb_build_object('group_id', p_group_id));
  END IF;

  -- Add user to group
  INSERT INTO group_members (group_id, user_id, status)
  VALUES (p_group_id, p_user_id, 'active');

  -- Update member count
  UPDATE groups SET member_count = member_count + 1 WHERE id = p_group_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.use_voice_credit(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_voice_credits INTEGER;
  v_star_balance INTEGER;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT voice_credits, star_balance INTO v_voice_credits, v_star_balance
  FROM user_profiles WHERE id = p_user_id;

  -- If has voice credits, deduct one
  IF v_voice_credits > 0 THEN
    UPDATE user_profiles SET voice_credits = voice_credits - 1 WHERE id = p_user_id;
    RETURN json_build_object('success', true, 'credits_remaining', v_voice_credits - 1, 'recharged', false);
  END IF;

  -- If no voice credits, try to recharge from stars (300 stars = 50 credits)
  IF v_star_balance >= 300 THEN
    UPDATE user_profiles
    SET star_balance = star_balance - 300,
        voice_credits = 49  -- 50 - 1 (for current use)
    WHERE id = p_user_id;

    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (p_user_id, 'voice_credit_purchase', -300, 'STARS', jsonb_build_object('credits_purchased', 50));

    RETURN json_build_object('success', true, 'credits_remaining', 49, 'recharged', true, 'stars_deducted', 300);
  END IF;

  RETURN json_build_object('success', false, 'error', 'Insufficient stars for voice credits', 'required_stars', 300, 'available_stars', v_star_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.use_ai_credit(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ai_credits INTEGER;
  v_star_balance INTEGER;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT ai_credits, star_balance INTO v_ai_credits, v_star_balance
  FROM user_profiles WHERE id = p_user_id;

  -- If has AI credits, deduct one
  IF v_ai_credits > 0 THEN
    UPDATE user_profiles SET ai_credits = ai_credits - 1 WHERE id = p_user_id;
    RETURN json_build_object('success', true, 'credits_remaining', v_ai_credits - 1, 'recharged', false);
  END IF;

  -- If no AI credits, try to recharge from stars (100 stars = 250 credits)
  IF v_star_balance >= 100 THEN
    UPDATE user_profiles
    SET star_balance = star_balance - 100,
        ai_credits = 249  -- 250 - 1 (for current use)
    WHERE id = p_user_id;

    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (p_user_id, 'ai_credit_purchase', -100, 'STARS', jsonb_build_object('credits_purchased', 250));

    RETURN json_build_object('success', true, 'credits_remaining', 249, 'recharged', true, 'stars_deducted', 100);
  END IF;

  RETURN json_build_object('success', false, 'error', 'Insufficient stars for AI credits', 'required_stars', 100, 'available_stars', v_star_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_voice_credits(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_voice_credits INTEGER;
  v_star_balance INTEGER;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT voice_credits, star_balance INTO v_voice_credits, v_star_balance
  FROM user_profiles WHERE id = p_user_id;

  IF v_voice_credits <= 0 THEN
    IF v_star_balance >= 300 THEN
      UPDATE user_profiles
      SET star_balance = star_balance - 300, voice_credits = 50
      WHERE id = p_user_id;
      RETURN jsonb_build_object('success', true, 'recharged', true, 'credits', 50);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
    END IF;
  ELSE
    UPDATE user_profiles
    SET voice_credits = voice_credits - 1
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'credits', v_voice_credits - 1);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_vip_post()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  IF (SELECT is_vip FROM user_profiles WHERE id = NEW.user_id) THEN
    UPDATE user_profiles
    SET star_balance = star_balance + 5
    WHERE id = NEW.user_id;

    INSERT INTO user_notifications (user_id, title, message, type, notification_category)
    VALUES (NEW.user_id, 'VIP Reward! ⭐', 'You earned +5 Stars for your new post!', 'success', 'vip_reward');
  END IF;
  RETURN NEW;
END;
$$;
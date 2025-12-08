
-- Fix process_story_view to properly handle story_id as text and insert view correctly
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
  -- Get story with explicit cast
  SELECT id, user_id, star_price
  INTO v_story
  FROM public.user_storylines
  WHERE id = p_story_id::uuid AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Story not found');
  END IF;

  v_uploader := v_story.user_id;
  v_price := COALESCE(v_story.star_price, 0);

  -- Free or own story - just record view
  IF v_price <= 0 OR v_uploader = p_viewer_id THEN
    -- Check if view exists
    SELECT EXISTS (SELECT 1 FROM public.story_views WHERE story_id = p_story_id::uuid AND viewer_id = p_viewer_id) INTO v_view_exists;
    
    IF NOT v_view_exists THEN
      INSERT INTO public.story_views (story_id, viewer_id, stars_spent) VALUES (p_story_id::uuid, p_viewer_id, 0);
      UPDATE public.user_storylines SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_story_id::uuid;
    END IF;
    
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', v_view_exists);
  END IF;

  -- Check if already viewed (prevent double charge)
  SELECT EXISTS (SELECT 1 FROM public.story_views WHERE story_id = p_story_id::uuid AND viewer_id = p_viewer_id) INTO v_view_exists;

  IF v_view_exists THEN
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  END IF;

  -- Check viewer star balance
  SELECT COALESCE(star_balance, 0) INTO v_viewer_stars FROM public.user_profiles WHERE id = p_viewer_id;
  IF v_viewer_stars < v_price THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient stars', 'required', v_price, 'available', v_viewer_stars);
  END IF;

  -- Calculate earnings (NGN)
  uploader_share := v_price * star_value * 0.60;
  viewer_share := v_price * star_value * 0.20;
  platform_share := v_price * star_value * 0.20;

  -- Deduct stars from viewer
  UPDATE public.user_profiles SET star_balance = star_balance - v_price WHERE id = p_viewer_id;

  -- Credit uploader wallet
  UPDATE public.user_profiles 
  SET wallet_balance = COALESCE(wallet_balance, 0) + uploader_share,
      total_earned = COALESCE(total_earned, 0) + uploader_share
  WHERE id = v_uploader;

  -- Credit viewer wallet (cashback)
  UPDATE public.user_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + viewer_share WHERE id = p_viewer_id;

  -- Record view
  INSERT INTO public.story_views (story_id, viewer_id, stars_spent) VALUES (p_story_id::uuid, p_viewer_id, v_price);
  
  -- Update view count
  UPDATE public.user_storylines SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_story_id::uuid;

  -- Record wallet history
  INSERT INTO public.wallet_history (user_id, type, amount, currency, meta) VALUES 
    (v_uploader, 'story_earn', uploader_share, 'NGN', json_build_object('story_id', p_story_id, 'stars_spent', v_price, 'viewer_id', p_viewer_id)),
    (p_viewer_id, 'story_cashback', viewer_share, 'NGN', json_build_object('story_id', p_story_id, 'stars_spent', v_price));

  -- Record transaction
  INSERT INTO public.story_transactions (story_id, uploader_id, viewer_id, stars_spent, uploader_earn, viewer_earn, platform_earn)
  VALUES (p_story_id::uuid, v_uploader, p_viewer_id, v_price, uploader_share, viewer_share, platform_share);

  -- Notify uploader
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES (v_uploader, 'Story View Earned! ⭐', format('You earned ₦%s from your story! %s stars spent.', uploader_share, v_price), 'success', 'story_earn', json_build_object('story_id', p_story_id, 'amount', uploader_share));

  -- Notify viewer
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES (p_viewer_id, 'Story Cashback! 💰', format('You earned ₦%s cashback from viewing this story!', viewer_share), 'success', 'story_cashback', json_build_object('story_id', p_story_id, 'amount', viewer_share));

  RETURN json_build_object('success', true, 'viewer_earn', viewer_share, 'uploader_earn', uploader_share, 'charged', true, 'stars_spent', v_price);
END;
$function$;

-- Update process_post_view to also record view in post_views table
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

  -- Free or own post - just record view
  IF v_price <= 0 OR v_uploader = p_viewer_id THEN
    SELECT EXISTS (SELECT 1 FROM public.post_views WHERE post_id = p_post_id AND user_id = p_viewer_id) INTO v_view_exists;
    
    IF NOT v_view_exists THEN
      INSERT INTO public.post_views (post_id, user_id) VALUES (p_post_id, p_viewer_id);
      UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;
    END IF;
    
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', v_view_exists);
  END IF;

  -- Check if already viewed (prevent double charge)
  SELECT EXISTS (SELECT 1 FROM public.post_views WHERE post_id = p_post_id AND user_id = p_viewer_id) INTO v_view_exists;

  IF v_view_exists THEN
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  END IF;

  -- Check star balance
  SELECT COALESCE(star_balance, 0) INTO v_viewer_stars FROM public.user_profiles WHERE id = p_viewer_id;
  IF v_viewer_stars < v_price THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient stars', 'required', v_price, 'available', v_viewer_stars);
  END IF;

  -- Calculate earnings (NGN)
  uploader_share := v_price * star_value * 0.60;
  viewer_share := v_price * star_value * 0.20;
  platform_share := v_price * star_value * 0.20;

  -- Deduct stars from viewer
  UPDATE public.user_profiles SET star_balance = star_balance - v_price WHERE id = p_viewer_id;

  -- Credit uploader wallet
  UPDATE public.user_profiles 
  SET wallet_balance = COALESCE(wallet_balance, 0) + uploader_share,
      total_earned = COALESCE(total_earned, 0) + uploader_share
  WHERE id = v_uploader;

  -- Credit viewer wallet (cashback)
  UPDATE public.user_profiles SET wallet_balance = COALESCE(wallet_balance, 0) + viewer_share WHERE id = p_viewer_id;

  -- Record view
  INSERT INTO public.post_views (post_id, user_id) VALUES (p_post_id, p_viewer_id);
  
  -- Update view count
  UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;

  -- Record wallet history
  INSERT INTO public.wallet_history (user_id, type, amount, currency, meta) VALUES 
    (v_uploader, 'upload_earn', uploader_share, 'NGN', json_build_object('post_id', p_post_id, 'stars_spent', v_price, 'viewer_id', p_viewer_id)),
    (p_viewer_id, 'view_earn', viewer_share, 'NGN', json_build_object('post_id', p_post_id, 'stars_spent', v_price));

  -- Record transaction
  INSERT INTO public.view_transactions (post_id, viewer_id, uploader_id, star_price, uploader_amount, viewer_amount, platform_amount)
  VALUES (p_post_id, p_viewer_id, v_uploader, v_price, uploader_share, viewer_share, platform_share);

  -- Notify uploader
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES (v_uploader, 'Post View Earned! ⭐', format('You earned ₦%s from your post! %s stars spent.', uploader_share, v_price), 'success', 'post_earn', json_build_object('post_id', p_post_id, 'amount', uploader_share));

  -- Notify viewer
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES (p_viewer_id, 'View Cashback! 💰', format('You earned ₦%s cashback!', viewer_share), 'success', 'view_cashback', json_build_object('post_id', p_post_id, 'amount', viewer_share));

  RETURN json_build_object('success', true, 'viewer_earn', viewer_share, 'uploader_earn', uploader_share, 'charged', true, 'stars_spent', v_price);
END;
$function$;

-- Create function to auto-archive posts older than 48 hours
CREATE OR REPLACE FUNCTION public.archive_old_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.posts
  SET post_status = 'viewed'
  WHERE post_status = 'new'
  AND created_at < NOW() - INTERVAL '48 hours';
END;
$function$;

-- Create function to deduct voice credits
CREATE OR REPLACE FUNCTION public.use_voice_credit(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_voice_credits INTEGER;
  v_star_balance INTEGER;
BEGIN
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
    VALUES (p_user_id, 'voice_credit_purchase', -300, 'STARS', json_build_object('credits_purchased', 50));
    
    RETURN json_build_object('success', true, 'credits_remaining', 49, 'recharged', true, 'stars_deducted', 300);
  END IF;
  
  RETURN json_build_object('success', false, 'error', 'Insufficient stars for voice credits', 'required_stars', 300, 'available_stars', v_star_balance);
END;
$function$;

-- Create function to deduct AI credits (FlowaIr)
CREATE OR REPLACE FUNCTION public.use_ai_credit(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ai_credits INTEGER;
  v_star_balance INTEGER;
BEGIN
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
    VALUES (p_user_id, 'ai_credit_purchase', -100, 'STARS', json_build_object('credits_purchased', 250));
    
    RETURN json_build_object('success', true, 'credits_remaining', 249, 'recharged', true, 'stars_deducted', 100);
  END IF;
  
  RETURN json_build_object('success', false, 'error', 'Insufficient stars for AI credits', 'required_stars', 100, 'available_stars', v_star_balance);
END;
$function$;

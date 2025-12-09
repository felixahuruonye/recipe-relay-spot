-- Drop and recreate process_story_view with correct implementation
DROP FUNCTION IF EXISTS public.process_story_view(text, uuid);
DROP FUNCTION IF EXISTS public.process_story_view(uuid, uuid);

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
  -- Get story
  SELECT id, user_id, star_price, view_count
  INTO v_story
  FROM public.user_storylines
  WHERE id = p_story_id::uuid AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Story not found');
  END IF;

  v_uploader := v_story.user_id;
  v_price := COALESCE(v_story.star_price, 0);

  -- Check if already viewed (prevent double processing)
  SELECT EXISTS (
    SELECT 1 FROM public.story_views 
    WHERE story_id = p_story_id::uuid AND viewer_id = p_viewer_id
  ) INTO v_view_exists;

  IF v_view_exists THEN
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  END IF;

  -- Free or own story - just record view
  IF v_price <= 0 OR v_uploader = p_viewer_id THEN
    INSERT INTO public.story_views (story_id, viewer_id, stars_spent) 
    VALUES (p_story_id::uuid, p_viewer_id, 0);
    
    UPDATE public.user_storylines 
    SET view_count = COALESCE(view_count, 0) + 1 
    WHERE id = p_story_id::uuid;
    
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', false, 'free', true);
  END IF;

  -- Check viewer star balance
  SELECT COALESCE(star_balance, 0) INTO v_viewer_stars 
  FROM public.user_profiles 
  WHERE id = p_viewer_id;
  
  IF v_viewer_stars < v_price THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient stars', 'required', v_price, 'available', v_viewer_stars);
  END IF;

  -- Calculate earnings (NGN)
  uploader_share := v_price * star_value * 0.60;
  viewer_share := v_price * star_value * 0.20;
  platform_share := v_price * star_value * 0.20;

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

  -- Record transaction with correct column names
  INSERT INTO public.view_transactions (story_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
  VALUES (p_story_id::uuid, p_viewer_id, v_uploader, v_price, uploader_share, viewer_share, platform_share);

  -- Notify users
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES 
    (v_uploader, 'Story Earned! ⭐', format('You earned ₦%s from your story!', uploader_share), 'success', 'story_earn', jsonb_build_object('story_id', p_story_id, 'amount', uploader_share)),
    (p_viewer_id, 'Cashback! 💰', format('You earned ₦%s cashback!', viewer_share), 'success', 'story_cashback', jsonb_build_object('story_id', p_story_id, 'amount', viewer_share));

  RETURN json_build_object('success', true, 'viewer_earn', viewer_share, 'uploader_earn', uploader_share, 'charged', true, 'stars_spent', v_price);
END;
$function$;

-- Drop and recreate process_post_view with correct implementation
DROP FUNCTION IF EXISTS public.process_post_view(text, uuid);

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

  -- Check if already viewed (prevent double processing)
  SELECT EXISTS (
    SELECT 1 FROM public.post_views 
    WHERE post_id = p_post_id AND user_id = p_viewer_id
  ) INTO v_view_exists;

  IF v_view_exists THEN
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  END IF;

  -- Free or own post - just record view
  IF v_price <= 0 OR v_uploader = p_viewer_id THEN
    INSERT INTO public.post_views (post_id, user_id) VALUES (p_post_id, p_viewer_id);
    UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;
    RETURN json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', false, 'free', true);
  END IF;

  -- Check star balance
  SELECT COALESCE(star_balance, 0) INTO v_viewer_stars 
  FROM public.user_profiles 
  WHERE id = p_viewer_id;
  
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
    (v_uploader, 'upload_earn', uploader_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'stars_spent', v_price, 'viewer_id', p_viewer_id::text)),
    (p_viewer_id, 'view_earn', viewer_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'stars_spent', v_price));

  -- Record transaction with correct column names
  INSERT INTO public.view_transactions (post_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
  VALUES (p_post_id, p_viewer_id, v_uploader, v_price, uploader_share, viewer_share, platform_share);

  -- Notify users
  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES 
    (v_uploader, 'Post Earned! ⭐', format('You earned ₦%s from your post!', uploader_share), 'success', 'post_earn', jsonb_build_object('post_id', p_post_id, 'amount', uploader_share)),
    (p_viewer_id, 'Cashback! 💰', format('You earned ₦%s cashback!', viewer_share), 'success', 'view_cashback', jsonb_build_object('post_id', p_post_id, 'amount', viewer_share));

  RETURN json_build_object('success', true, 'viewer_earn', viewer_share, 'uploader_earn', uploader_share, 'charged', true, 'stars_spent', v_price);
END;
$function$;

-- Update old posts to 'viewed' status (older than 48 hours)
UPDATE public.posts 
SET post_status = 'viewed' 
WHERE post_status = 'new' 
  AND created_at < NOW() - INTERVAL '48 hours';

-- Create scheduled function for auto-archiving posts (needs pg_cron enabled)
CREATE OR REPLACE FUNCTION public.auto_archive_old_posts()
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

-- Enable pg_cron extension if not exists (may fail if not available)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron extension not available';
    END;
  END IF;
END
$$;

-- Schedule hourly job to archive old posts (if pg_cron is available)
DO $$
BEGIN
  PERFORM cron.schedule('archive-old-posts', '0 * * * *', 'SELECT public.auto_archive_old_posts()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cron job - pg_cron may not be enabled';
END
$$;
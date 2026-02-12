
-- Create a SECURITY DEFINER function to delete a user and all their data
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Delete from all user-related tables
  DELETE FROM public.storyline_reactions WHERE user_id = p_target_user_id;
  DELETE FROM public.storyline_comments WHERE user_id = p_target_user_id;
  DELETE FROM public.story_views WHERE viewer_id = p_target_user_id;
  DELETE FROM public.story_transactions WHERE viewer_id = p_target_user_id OR uploader_id = p_target_user_id;
  DELETE FROM public.sticker_usage WHERE user_id = p_target_user_id;
  DELETE FROM public.user_storylines WHERE user_id = p_target_user_id;
  DELETE FROM public.post_views WHERE user_id = p_target_user_id;
  DELETE FROM public.post_shares WHERE user_id = p_target_user_id;
  DELETE FROM public.post_likes WHERE user_id = p_target_user_id;
  DELETE FROM public.post_reports WHERE reporter_user_id = p_target_user_id;
  DELETE FROM public.post_comments WHERE user_id = p_target_user_id;
  DELETE FROM public.comment_reactions WHERE user_id = p_target_user_id;
  DELETE FROM public.comment_replies WHERE user_id = p_target_user_id;
  DELETE FROM public.comment_reports WHERE reporter_user_id = p_target_user_id;
  DELETE FROM public.comments WHERE user_id = p_target_user_id;
  DELETE FROM public.hidden_posts WHERE user_id = p_target_user_id;
  DELETE FROM public.posts WHERE user_id = p_target_user_id;
  DELETE FROM public.private_messages WHERE from_user_id = p_target_user_id OR to_user_id = p_target_user_id;
  DELETE FROM public.messages WHERE from_user_id = p_target_user_id;
  DELETE FROM public.group_messages WHERE user_id = p_target_user_id;
  DELETE FROM public.group_members WHERE user_id = p_target_user_id;
  DELETE FROM public.groups WHERE owner_id = p_target_user_id;
  DELETE FROM public.followers WHERE follower_id = p_target_user_id OR following_id = p_target_user_id;
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;
  DELETE FROM public.user_notifications WHERE user_id = p_target_user_id;
  DELETE FROM public.admin_private_messages WHERE user_id = p_target_user_id;
  DELETE FROM public.admin_user_messages WHERE user_id = p_target_user_id;
  DELETE FROM public.admin_questions WHERE user_uuid = p_target_user_id;
  DELETE FROM public.user_activity_logs WHERE user_id = p_target_user_id;
  DELETE FROM public.user_login_history WHERE user_id = p_target_user_id;
  DELETE FROM public.user_sessions WHERE user_id = p_target_user_id;
  DELETE FROM public.user_checkins WHERE user_id = p_target_user_id;
  DELETE FROM public.user_feedback WHERE user_uuid = p_target_user_id;
  DELETE FROM public.user_bank_details WHERE user_uuid = p_target_user_id;
  DELETE FROM public.user_balances WHERE user_id = p_target_user_id;
  DELETE FROM public.balance_history WHERE user_id = p_target_user_id;
  DELETE FROM public.payment_requests WHERE user_id = p_target_user_id;
  DELETE FROM public.payments WHERE user_id = p_target_user_id;
  DELETE FROM public.transactions WHERE user_id = p_target_user_id;
  DELETE FROM public.orders WHERE buyer_user_id = p_target_user_id OR seller_user_id = p_target_user_id;
  DELETE FROM public.products WHERE seller_user_id = p_target_user_id;
  DELETE FROM public.task_completions WHERE user_id = p_target_user_id;
  DELETE FROM public.task_submissions WHERE user_id = p_target_user_id;
  DELETE FROM public.tasks WHERE user_id = p_target_user_id;
  DELETE FROM public.marketplace_offers WHERE user_id = p_target_user_id;
  DELETE FROM public.music_offers WHERE user_id = p_target_user_id;
  DELETE FROM public.referrals WHERE referrer_id = p_target_user_id;
  DELETE FROM public.saved_searches WHERE user_id = p_target_user_id;
  DELETE FROM public.reports WHERE reporter_user_id = p_target_user_id;
  DELETE FROM public.user_reports WHERE reporter_id = p_target_user_id OR reported_user_id = p_target_user_id;
  DELETE FROM public.disputes WHERE user_id = p_target_user_id;
  DELETE FROM public.live_chat_sessions WHERE user_id = p_target_user_id;
  DELETE FROM public.chat_responses WHERE user_id = p_target_user_id;
  DELETE FROM public.telegram_messages WHERE user_id = p_target_user_id;
  DELETE FROM public.system_errors WHERE user_id = p_target_user_id;
  DELETE FROM public.review_requests WHERE user_id = p_target_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.user_profiles WHERE id = p_target_user_id;

  -- Delete from auth.users (this permanently removes the user from Supabase Auth)
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Also fix: allow group owners to delete their groups via RPC
CREATE OR REPLACE FUNCTION public.delete_own_group(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller owns the group
  IF NOT EXISTS (
    SELECT 1 FROM public.groups WHERE id = p_group_id AND owner_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not the group owner');
  END IF;

  -- Delete group data
  DELETE FROM public.group_messages WHERE group_id = p_group_id;
  DELETE FROM public.group_members WHERE group_id = p_group_id;
  DELETE FROM public.groups WHERE id = p_group_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

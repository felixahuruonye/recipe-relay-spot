CREATE OR REPLACE FUNCTION public.credit_offer_completion(
  p_user_id uuid,
  p_task_id uuid,
  p_provider text,
  p_task_title text,
  p_stars integer,
  p_naira numeric,
  p_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_exists boolean;
BEGIN
  IF p_transaction_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.offer_task_completions WHERE transaction_id = p_transaction_id) INTO v_exists;
    IF v_exists THEN
      RETURN jsonb_build_object('success', false, 'error', 'duplicate');
    END IF;
  END IF;

  SELECT username INTO v_username FROM public.user_profiles WHERE id = p_user_id;
  IF v_username IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'on', true);

  UPDATE public.user_profiles
  SET star_balance = COALESCE(star_balance, 0) + GREATEST(p_stars, 0),
      wallet_balance = COALESCE(wallet_balance, 0) + GREATEST(p_naira, 0),
      total_earned = COALESCE(total_earned, 0) + GREATEST(p_naira, 0)
  WHERE id = p_user_id;

  INSERT INTO public.offer_task_completions
    (user_id, username, task_id, provider, task_title, status, stars_credited, naira_credited, transaction_id, completed_at)
  VALUES
    (p_user_id, v_username, p_task_id, COALESCE(p_provider, 'CUSTOM'), p_task_title, 'completed',
     GREATEST(p_stars, 0), GREATEST(p_naira, 0), p_transaction_id, now());

  IF p_naira > 0 THEN
    INSERT INTO public.wallet_history (user_id, amount, type, currency, meta)
    VALUES (p_user_id, p_naira, 'offer_earn', 'NGN',
            jsonb_build_object('task', COALESCE(p_task_title, 'Offer reward'), 'provider', COALESCE(p_provider, 'CUSTOM')));
  END IF;

  INSERT INTO public.user_notifications (user_id, title, message, type)
  VALUES (p_user_id, 'Task reward credited',
          'You earned ' || GREATEST(p_stars,0) || ' Stars for "' || COALESCE(p_task_title, 'a task') || '"', 'earning');

  RETURN jsonb_build_object('success', true, 'stars', GREATEST(p_stars,0), 'naira', GREATEST(p_naira,0));
END;
$$;
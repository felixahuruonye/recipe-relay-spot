-- Admin RPCs + tighten notification RLS

-- 1) Safer user_notifications policies (users see their own; admins see all)
DO $$
BEGIN
  -- drop overly-permissive policy if present
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_notifications' AND policyname='Allow user notifications'
  ) THEN
    EXECUTE 'DROP POLICY "Allow user notifications" ON public.user_notifications';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_notifications' AND policyname='Users can view own notifications'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view own notifications" ON public.user_notifications';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_notifications' AND policyname='Users can update own notifications'
  ) THEN
    EXECUTE 'DROP POLICY "Users can update own notifications" ON public.user_notifications';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_notifications' AND policyname='Users can insert own notifications'
  ) THEN
    EXECUTE 'DROP POLICY "Users can insert own notifications" ON public.user_notifications';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_notifications' AND policyname='Admins can manage notifications'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage notifications" ON public.user_notifications';
  END IF;
END $$;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
ON public.user_notifications
FOR SELECT
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can update own notifications"
ON public.user_notifications
FOR UPDATE
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can insert own notifications"
ON public.user_notifications
FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Admin: adjust balances (stars + wallet) via RPC
CREATE OR REPLACE FUNCTION public.admin_set_user_balances(
  p_user_id uuid,
  p_star_balance integer DEFAULT NULL,
  p_wallet_balance numeric DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_prev_star integer;
  v_prev_wallet numeric;
  v_new_star integer;
  v_new_wallet numeric;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT COALESCE(star_balance, 0), COALESCE(wallet_balance, 0)
  INTO v_prev_star, v_prev_wallet
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_star := COALESCE(p_star_balance, v_prev_star);
  v_new_wallet := COALESCE(p_wallet_balance, v_prev_wallet);

  UPDATE public.user_profiles
  SET star_balance = v_new_star,
      wallet_balance = v_new_wallet,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES (
    p_user_id,
    'Account Updated',
    COALESCE(p_reason, 'Your account balances were updated by an admin.'),
    'info',
    'admin',
    jsonb_build_object(
      'prev_star', v_prev_star,
      'new_star', v_new_star,
      'prev_wallet', v_prev_wallet,
      'new_wallet', v_new_wallet
    )
  );

  RETURN jsonb_build_object('success', true, 'prev_star', v_prev_star, 'new_star', v_new_star, 'prev_wallet', v_prev_wallet, 'new_wallet', v_new_wallet);
END;
$$;

-- 3) Admin: update payment request status + handle wallet deduction on PAID
CREATE OR REPLACE FUNCTION public.admin_update_payment_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_req record;
  v_wallet numeric;
  v_new_wallet numeric;
  v_title text;
  v_message text;
  v_type text;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_req
  FROM public.payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  -- Update request
  UPDATE public.payment_requests
  SET status = p_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      processed_at = CASE WHEN p_status IN ('under_review','paid','rejected') THEN now() ELSE processed_at END
  WHERE id = p_request_id;

  -- If paid, deduct from wallet (full to zero if amount >= wallet)
  IF p_status = 'paid' THEN
    SELECT COALESCE(wallet_balance, 0)
    INTO v_wallet
    FROM public.user_profiles
    WHERE id = v_req.user_id
    FOR UPDATE;

    v_new_wallet := GREATEST(v_wallet - COALESCE(v_req.amount, 0), 0);

    UPDATE public.user_profiles
    SET wallet_balance = v_new_wallet,
        updated_at = now()
    WHERE id = v_req.user_id;
  END IF;

  -- Notification copy
  IF p_status = 'pending' THEN
    v_title := 'Withdrawal Submitted';
    v_message := 'Your withdrawal request is pending.';
    v_type := 'info';
  ELSIF p_status = 'under_review' THEN
    v_title := 'Withdrawal Under Review';
    v_message := 'Your withdrawal request is now under review.';
    v_type := 'info';
  ELSIF p_status = 'paid' THEN
    v_title := 'Withdrawal Paid';
    v_message := 'Your withdrawal request has been paid.';
    v_type := 'success';
  ELSIF p_status = 'rejected' THEN
    v_title := 'Withdrawal Rejected';
    v_message := COALESCE(p_admin_notes, 'Your withdrawal request was rejected.');
    v_type := 'error';
  ELSE
    v_title := 'Withdrawal Updated';
    v_message := 'Your withdrawal request status was updated.';
    v_type := 'info';
  END IF;

  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES (
    v_req.user_id,
    v_title,
    v_message,
    v_type,
    'withdrawal',
    jsonb_build_object('payment_request_id', v_req.id, 'status', p_status, 'amount', v_req.amount)
  );

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- 4) Admin: broadcast message to everyone (general_messages + notifications)
CREATE OR REPLACE FUNCTION public.admin_send_broadcast(
  p_title text,
  p_message text,
  p_type text DEFAULT 'info'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_msg_id uuid;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO public.general_messages (title, message, created_by)
  VALUES (p_title, p_message, auth.uid()::text)
  RETURNING id INTO v_msg_id;

  INSERT INTO public.user_notifications (user_id, title, message, type, notification_category, action_data)
  SELECT id,
         p_title,
         p_message,
         p_type,
         'broadcast',
         jsonb_build_object('general_message_id', v_msg_id)
  FROM public.user_profiles;

  RETURN jsonb_build_object('success', true, 'general_message_id', v_msg_id);
END;
$$;
-- Stage 4: Withdrawal engine — min ₦5,000, level limits, reserve funds

CREATE TABLE IF NOT EXISTS public.withdrawal_settings (
  setting_key text PRIMARY KEY,
  setting_value numeric NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.withdrawal_settings (setting_key, setting_value, description) VALUES
  ('min_withdrawal_ngn', 5000, 'Minimum withdrawal amount in NGN'),
  ('level2_monthly_limit_ngn', 7000, 'Level 2 max total withdrawals per calendar month'),
  ('level3_monthly_limit_ngn', 250000, 'Level 3 max total withdrawals per calendar month'),
  ('daily_limit_ngn', 50000, 'Max total withdrawals per calendar day (0 = disabled)'),
  ('per_transaction_limit_ngn', 50000, 'Max per single withdrawal (0 = use monthly)'),
  ('fee_percent', 0, 'Fee percent deducted from withdrawal amount'),
  ('fee_flat_ngn', 0, 'Flat fee in NGN')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.withdrawal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated read withdrawal_settings" ON public.withdrawal_settings;
CREATE POLICY "Anyone authenticated read withdrawal_settings" ON public.withdrawal_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage withdrawal_settings" ON public.withdrawal_settings;
CREATE POLICY "Admins manage withdrawal_settings" ON public.withdrawal_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')
    )
  );

-- Ensure payment_requests has useful columns (additive)
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reserved_amount numeric,
  ADD COLUMN IF NOT EXISTS fee_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric,
  ADD COLUMN IF NOT EXISTS verification_level_at_request integer,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_info jsonb,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'NGN';

CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_idempotency_uidx
  ON public.payment_requests (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Request withdrawal (server-side validation + reserve)
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_payment_method text DEFAULT 'bank_transfer',
  p_account_info jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bal numeric;
  v_level integer;
  v_status text;
  v_earn text;
  v_min numeric := 5000;
  v_l2_month numeric := 7000;
  v_l3_month numeric := 250000;
  v_daily numeric := 0;
  v_per_tx numeric := 0;
  v_fee_pct numeric := 0;
  v_fee_flat numeric := 0;
  v_fee numeric := 0;
  v_net numeric;
  v_month_used numeric := 0;
  v_day_used numeric := 0;
  v_month_limit numeric;
  v_req_id uuid;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  -- Idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM payment_requests
    WHERE user_id = v_uid AND idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN json_build_object('success', true, 'id', v_existing, 'message', 'Duplicate request ignored');
    END IF;
  END IF;

  SELECT COALESCE(setting_value, 5000) INTO v_min FROM withdrawal_settings WHERE setting_key = 'min_withdrawal_ngn';
  SELECT COALESCE(setting_value, 7000) INTO v_l2_month FROM withdrawal_settings WHERE setting_key = 'level2_monthly_limit_ngn';
  SELECT COALESCE(setting_value, 250000) INTO v_l3_month FROM withdrawal_settings WHERE setting_key = 'level3_monthly_limit_ngn';
  SELECT COALESCE(setting_value, 0) INTO v_daily FROM withdrawal_settings WHERE setting_key = 'daily_limit_ngn';
  SELECT COALESCE(setting_value, 0) INTO v_per_tx FROM withdrawal_settings WHERE setting_key = 'per_transaction_limit_ngn';
  SELECT COALESCE(setting_value, 0) INTO v_fee_pct FROM withdrawal_settings WHERE setting_key = 'fee_percent';
  SELECT COALESCE(setting_value, 0) INTO v_fee_flat FROM withdrawal_settings WHERE setting_key = 'fee_flat_ngn';

  SELECT
    COALESCE(wallet_balance, 0),
    COALESCE(verification_level, 0),
    COALESCE(verification_status, 'NOT_STARTED'),
    COALESCE(earning_status, 'not_verified')
  INTO v_bal, v_level, v_status, v_earn
  FROM user_profiles WHERE id = v_uid FOR UPDATE;

  IF v_level < 2 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Complete identity verification (Level 2) to unlock withdrawals.',
      'code', 'VERIFICATION_REQUIRED'
    );
  END IF;

  IF lower(COALESCE(v_earn, '')) IN ('banned', 'suspended') THEN
    RETURN json_build_object('success', false, 'error', 'Account cannot withdraw right now.', 'code', 'RESTRICTED');
  END IF;

  IF p_amount < v_min THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Your approved balance has not reached the ₦%s minimum withdrawal.', to_char(v_min, 'FM999,999,999')),
      'code', 'BELOW_MINIMUM',
      'min', v_min
    );
  END IF;

  IF p_amount > v_bal THEN
    RETURN json_build_object('success', false, 'error', 'Amount exceeds available balance.', 'code', 'INSUFFICIENT');
  END IF;

  IF v_per_tx > 0 AND p_amount > v_per_tx THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Per-transaction limit is ₦%s.', to_char(v_per_tx, 'FM999,999,999')),
      'code', 'PER_TX_LIMIT',
      'limit', v_per_tx
    );
  END IF;

  v_month_limit := CASE WHEN v_level >= 3 THEN v_l3_month ELSE v_l2_month END;

  SELECT COALESCE(SUM(amount), 0) INTO v_month_used
  FROM payment_requests
  WHERE user_id = v_uid
    AND COALESCE(status, 'pending') NOT IN ('rejected', 'failed', 'cancelled')
    AND created_at >= date_trunc('month', now());

  IF v_month_used + p_amount > v_month_limit THEN
    RETURN json_build_object(
      'success', false,
      'error', format('Monthly limit is ₦%s. Used ₦%s this month.',
        to_char(v_month_limit, 'FM999,999,999'),
        to_char(v_month_used, 'FM999,999,999')),
      'code', 'MONTHLY_LIMIT',
      'limit', v_month_limit,
      'used', v_month_used
    );
  END IF;

  IF v_daily > 0 THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_day_used
    FROM payment_requests
    WHERE user_id = v_uid
      AND COALESCE(status, 'pending') NOT IN ('rejected', 'failed', 'cancelled')
      AND created_at >= date_trunc('day', now());
    IF v_day_used + p_amount > v_daily THEN
      RETURN json_build_object(
        'success', false,
        'error', format('Daily limit is ₦%s.', to_char(v_daily, 'FM999,999,999')),
        'code', 'DAILY_LIMIT',
        'limit', v_daily
      );
    END IF;
  END IF;

  v_fee := round(p_amount * COALESCE(v_fee_pct, 0) / 100.0, 2) + COALESCE(v_fee_flat, 0);
  IF v_fee < 0 THEN v_fee := 0; END IF;
  IF v_fee >= p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Fee exceeds amount');
  END IF;
  v_net := p_amount - v_fee;

  -- Reserve funds
  UPDATE user_profiles
  SET wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - p_amount),
      updated_at = now()
  WHERE id = v_uid;

  INSERT INTO payment_requests (
    user_id, amount, reserved_amount, fee_amount, net_amount,
    status, payment_method, account_info, verification_level_at_request,
    idempotency_key, currency
  ) VALUES (
    v_uid, p_amount, p_amount, v_fee, v_net,
    'pending', COALESCE(p_payment_method, 'bank_transfer'), COALESCE(p_account_info, '{}'::jsonb),
    v_level, p_idempotency_key, 'NGN'
  )
  RETURNING id INTO v_req_id;

  BEGIN
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (
      v_uid, 'withdrawal_reserve', -p_amount, 'NGN',
      jsonb_build_object('payment_request_id', v_req_id, 'fee', v_fee, 'net', v_net, 'status', 'pending')
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'id', v_req_id,
    'amount', p_amount,
    'fee', v_fee,
    'net', v_net,
    'status', 'pending',
    'monthly_limit', v_month_limit,
    'monthly_used', v_month_used + p_amount
  );
END;
$$;

-- Release reserve on reject/cancel (admin or system)
CREATE OR REPLACE FUNCTION public.release_withdrawal_reserve(
  p_request_id uuid,
  p_new_status text DEFAULT 'rejected',
  p_admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = v_uid AND (is_admin = true OR role = 'admin')
  ) INTO v_is_admin;

  SELECT * INTO v_row FROM payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  IF NOT v_is_admin AND v_row.user_id <> v_uid THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF COALESCE(v_row.status, 'pending') NOT IN ('pending', 'processing', 'under_review') THEN
    RETURN json_build_object('success', false, 'error', 'Cannot release from status ' || v_row.status);
  END IF;

  IF p_new_status NOT IN ('rejected', 'cancelled', 'failed') THEN
    p_new_status := 'rejected';
  END IF;

  -- Refund reserved amount
  UPDATE user_profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) + COALESCE(v_row.reserved_amount, v_row.amount),
      updated_at = now()
  WHERE id = v_row.user_id;

  UPDATE payment_requests
  SET status = p_new_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      processed_at = now()
  WHERE id = p_request_id;

  BEGIN
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (
      v_row.user_id, 'withdrawal_release', COALESCE(v_row.reserved_amount, v_row.amount), 'NGN',
      jsonb_build_object('payment_request_id', p_request_id, 'status', p_new_status)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN json_build_object('success', true, 'status', p_new_status);
END;
$$;

-- Mark paid (admin) — funds already reserved, no second debit
CREATE OR REPLACE FUNCTION public.mark_withdrawal_paid(
  p_request_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = v_uid AND (is_admin = true OR role = 'admin')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Admin only');
  END IF;

  SELECT * INTO v_row FROM payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  IF COALESCE(v_row.status, '') = 'paid' THEN
    RETURN json_build_object('success', true, 'message', 'Already paid');
  END IF;

  IF COALESCE(v_row.status, 'pending') IN ('rejected', 'cancelled', 'failed') THEN
    RETURN json_build_object('success', false, 'error', 'Request was closed');
  END IF;

  UPDATE payment_requests
  SET status = 'paid',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      processed_at = now()
  WHERE id = p_request_id;

  BEGIN
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (
      v_row.user_id, 'withdrawal_paid', -COALESCE(v_row.amount, 0), 'NGN',
      jsonb_build_object('payment_request_id', p_request_id, 'net', v_row.net_amount)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN json_build_object('success', true, 'status', 'paid');
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_withdrawal_reserve(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_paid(uuid, text) TO authenticated;

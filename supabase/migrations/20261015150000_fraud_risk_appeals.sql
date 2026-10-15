-- Stage 5: Fraud signals, restrictions, appeals (does not wipe wallets)

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawal_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipping_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rewards_hold boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  severity integer NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 10),
  score_delta integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_events_user_idx ON public.risk_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_events_type_idx ON public.risk_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fraud_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved_legit','confirmed_fraud','appealed')),
  title text NOT NULL,
  summary text,
  risk_score_snapshot integer DEFAULT 0,
  restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to uuid REFERENCES auth.users(id),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_cases_status_idx ON public.fraud_cases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_cases_user_idx ON public.fraud_cases (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.account_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restriction_type text NOT NULL
    CHECK (restriction_type IN (
      'withdrawal','tipping','rewards_hold','monetization_suspend','account_suspend'
    )),
  active boolean NOT NULL DEFAULT true,
  reason text,
  case_id uuid REFERENCES public.fraud_cases(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS account_restrictions_user_active_idx
  ON public.account_restrictions (user_id, active);

CREATE TABLE IF NOT EXISTS public.appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.fraud_cases(id) ON DELETE SET NULL,
  restriction_id uuid REFERENCES public.account_restrictions(id) ON DELETE SET NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','accepted','rejected')),
  admin_response text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appeals_status_idx ON public.appeals (status, created_at DESC);

ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

-- Users: read own risk summary pieces + submit appeals
DROP POLICY IF EXISTS "Users read own risk_events" ON public.risk_events;
CREATE POLICY "Users read own risk_events" ON public.risk_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own fraud_cases" ON public.fraud_cases;
CREATE POLICY "Users read own fraud_cases" ON public.fraud_cases
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own restrictions" ON public.account_restrictions;
CREATE POLICY "Users read own restrictions" ON public.account_restrictions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own appeals" ON public.appeals;
CREATE POLICY "Users read own appeals" ON public.appeals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own appeals" ON public.appeals;
CREATE POLICY "Users insert own appeals" ON public.appeals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin all-access (best-effort)
DO $$
BEGIN
  CREATE POLICY "Admins manage risk_events" ON public.risk_events FOR ALL
    USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Admins manage fraud_cases" ON public.fraud_cases FOR ALL
    USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Admins manage account_restrictions" ON public.account_restrictions FOR ALL
    USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "Admins manage appeals" ON public.appeals FOR ALL
    USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Log a risk event and bump score (system / admin)
CREATE OR REPLACE FUNCTION public.log_risk_event(
  p_user_id uuid,
  p_event_type text,
  p_severity integer DEFAULT 2,
  p_score_delta integer DEFAULT 5,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_related_user_id uuid DEFAULT NULL,
  p_source text DEFAULT 'system'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO risk_events (user_id, related_user_id, event_type, severity, score_delta, evidence, source)
  VALUES (p_user_id, p_related_user_id, p_event_type, GREATEST(1, LEAST(10, COALESCE(p_severity, 2))), COALESCE(p_score_delta, 5), COALESCE(p_evidence, '{}'::jsonb), COALESCE(p_source, 'system'))
  RETURNING id INTO v_id;

  UPDATE user_profiles
  SET risk_score = LEAST(100, GREATEST(0, COALESCE(risk_score, 0) + COALESCE(p_score_delta, 5))),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN v_id;
END;
$$;

-- Evaluate withdrawal risk signals (called inside request flow)
CREATE OR REPLACE FUNCTION public.evaluate_withdrawal_risk(p_user_id uuid, p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_score integer := 0;
  v_restricted boolean := false;
  v_tips_24h integer := 0;
  v_wd_24h integer := 0;
  v_flags text[] := ARRAY[]::text[];
BEGIN
  SELECT COALESCE(risk_score, 0), COALESCE(withdrawal_restricted, false)
  INTO v_score, v_restricted
  FROM user_profiles WHERE id = p_user_id;

  IF v_restricted OR EXISTS (
    SELECT 1 FROM account_restrictions
    WHERE user_id = p_user_id AND active = true AND restriction_type = 'withdrawal'
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RETURN json_build_object('allowed', false, 'reason', 'Withdrawal restricted on this account.', 'code', 'RESTRICTED', 'score', v_score);
  END IF;

  SELECT COUNT(*) INTO v_tips_24h FROM tip_ledger
  WHERE from_user_id = p_user_id AND created_at > now() - interval '24 hours';

  SELECT COUNT(*) INTO v_wd_24h FROM payment_requests
  WHERE user_id = p_user_id AND created_at > now() - interval '24 hours'
    AND COALESCE(status, 'pending') NOT IN ('rejected', 'cancelled', 'failed');

  IF v_wd_24h >= 5 THEN
    v_flags := array_append(v_flags, 'high_withdrawal_velocity');
    PERFORM log_risk_event(p_user_id, 'high_withdrawal_velocity', 6, 8,
      jsonb_build_object('count_24h', v_wd_24h, 'amount', p_amount), NULL, 'bot');
  END IF;

  IF p_amount >= 50000 THEN
    v_flags := array_append(v_flags, 'large_withdrawal');
    PERFORM log_risk_event(p_user_id, 'large_withdrawal', 4, 3,
      jsonb_build_object('amount', p_amount), NULL, 'system');
  END IF;

  SELECT COALESCE(risk_score, 0) INTO v_score FROM user_profiles WHERE id = p_user_id;

  IF v_score >= 80 THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'High risk score — withdrawal held for manual review.',
      'code', 'HIGH_RISK',
      'score', v_score,
      'flags', v_flags
    );
  END IF;

  RETURN json_build_object('allowed', true, 'score', v_score, 'flags', v_flags, 'tips_24h', v_tips_24h);
END;
$$;

-- Patch request_withdrawal to respect risk (redefine with risk check)
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
  v_risk json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM payment_requests
    WHERE user_id = v_uid AND idempotency_key = p_idempotency_key LIMIT 1;
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

  SELECT COALESCE(wallet_balance, 0), COALESCE(verification_level, 0),
         COALESCE(verification_status, 'NOT_STARTED'), COALESCE(earning_status, 'not_verified')
  INTO v_bal, v_level, v_status, v_earn
  FROM user_profiles WHERE id = v_uid FOR UPDATE;

  IF v_level < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Complete identity verification (Level 2) to unlock withdrawals.', 'code', 'VERIFICATION_REQUIRED');
  END IF;
  IF lower(COALESCE(v_earn, '')) IN ('banned', 'suspended') THEN
    RETURN json_build_object('success', false, 'error', 'Account cannot withdraw right now.', 'code', 'RESTRICTED');
  END IF;

  v_risk := evaluate_withdrawal_risk(v_uid, p_amount);
  IF (v_risk->>'allowed')::boolean IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', v_risk->>'reason', 'code', v_risk->>'code', 'risk', v_risk);
  END IF;

  IF p_amount < v_min THEN
    RETURN json_build_object('success', false, 'error', format('Minimum withdrawal is ₦%s.', to_char(v_min, 'FM999,999,999')), 'code', 'BELOW_MINIMUM', 'min', v_min);
  END IF;
  IF p_amount > v_bal THEN
    RETURN json_build_object('success', false, 'error', 'Amount exceeds available balance.', 'code', 'INSUFFICIENT');
  END IF;
  IF v_per_tx > 0 AND p_amount > v_per_tx THEN
    RETURN json_build_object('success', false, 'error', format('Per-transaction limit is ₦%s.', to_char(v_per_tx, 'FM999,999,999')), 'code', 'PER_TX_LIMIT');
  END IF;

  v_month_limit := CASE WHEN v_level >= 3 THEN v_l3_month ELSE v_l2_month END;
  SELECT COALESCE(SUM(amount), 0) INTO v_month_used FROM payment_requests
  WHERE user_id = v_uid AND COALESCE(status, 'pending') NOT IN ('rejected', 'failed', 'cancelled')
    AND created_at >= date_trunc('month', now());
  IF v_month_used + p_amount > v_month_limit THEN
    RETURN json_build_object('success', false, 'error', 'Monthly withdrawal limit reached.', 'code', 'MONTHLY_LIMIT', 'limit', v_month_limit, 'used', v_month_used);
  END IF;

  IF v_daily > 0 THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_day_used FROM payment_requests
    WHERE user_id = v_uid AND COALESCE(status, 'pending') NOT IN ('rejected', 'failed', 'cancelled')
      AND created_at >= date_trunc('day', now());
    IF v_day_used + p_amount > v_daily THEN
      RETURN json_build_object('success', false, 'error', 'Daily withdrawal limit reached.', 'code', 'DAILY_LIMIT');
    END IF;
  END IF;

  v_fee := round(p_amount * COALESCE(v_fee_pct, 0) / 100.0, 2) + COALESCE(v_fee_flat, 0);
  IF v_fee < 0 THEN v_fee := 0; END IF;
  IF v_fee >= p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Fee exceeds amount');
  END IF;
  v_net := p_amount - v_fee;

  UPDATE user_profiles
  SET wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - p_amount), updated_at = now()
  WHERE id = v_uid;

  INSERT INTO payment_requests (
    user_id, amount, reserved_amount, fee_amount, net_amount,
    status, payment_method, account_info, verification_level_at_request,
    idempotency_key, currency
  ) VALUES (
    v_uid, p_amount, p_amount, v_fee, v_net,
    'pending', COALESCE(p_payment_method, 'bank_transfer'), COALESCE(p_account_info, '{}'::jsonb),
    v_level, p_idempotency_key, 'NGN'
  ) RETURNING id INTO v_req_id;

  BEGIN
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (v_uid, 'withdrawal_reserve', -p_amount, 'NGN',
      jsonb_build_object('payment_request_id', v_req_id, 'fee', v_fee, 'net', v_net, 'risk', v_risk));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN json_build_object(
    'success', true, 'id', v_req_id, 'amount', p_amount, 'fee', v_fee, 'net', v_net,
    'status', 'pending', 'risk', v_risk
  );
END;
$$;

-- Admin: apply restriction without wiping wallet
CREATE OR REPLACE FUNCTION public.apply_account_restriction(
  p_user_id uuid,
  p_restriction_type text,
  p_reason text DEFAULT NULL,
  p_case_id uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_uid AND (is_admin = true OR role = 'admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Admin only');
  END IF;

  INSERT INTO account_restrictions (user_id, restriction_type, reason, case_id, created_by, expires_at)
  VALUES (p_user_id, p_restriction_type, p_reason, p_case_id, v_uid, p_expires_at)
  RETURNING id INTO v_id;

  IF p_restriction_type = 'withdrawal' THEN
    UPDATE user_profiles SET withdrawal_restricted = true, updated_at = now() WHERE id = p_user_id;
  ELSIF p_restriction_type = 'tipping' THEN
    UPDATE user_profiles SET tipping_restricted = true, updated_at = now() WHERE id = p_user_id;
  ELSIF p_restriction_type = 'rewards_hold' THEN
    UPDATE user_profiles SET rewards_hold = true, updated_at = now() WHERE id = p_user_id;
  ELSIF p_restriction_type = 'account_suspend' THEN
    UPDATE user_profiles SET earning_status = 'suspended', updated_at = now() WHERE id = p_user_id;
  END IF;

  PERFORM log_risk_event(p_user_id, 'restriction_applied', 5, 0,
    jsonb_build_object('type', p_restriction_type, 'reason', p_reason), NULL, 'admin');

  RETURN json_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.lift_account_restriction(p_restriction_id uuid, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = v_uid AND (is_admin = true OR role = 'admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Admin only');
  END IF;

  SELECT * INTO v_row FROM account_restrictions WHERE id = p_restriction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not found');
  END IF;

  UPDATE account_restrictions
  SET active = false, lifted_at = now(), lifted_by = v_uid, reason = COALESCE(p_note, reason)
  WHERE id = p_restriction_id;

  IF v_row.restriction_type = 'withdrawal' AND NOT EXISTS (
    SELECT 1 FROM account_restrictions WHERE user_id = v_row.user_id AND active AND restriction_type = 'withdrawal'
  ) THEN
    UPDATE user_profiles SET withdrawal_restricted = false WHERE id = v_row.user_id;
  ELSIF v_row.restriction_type = 'tipping' AND NOT EXISTS (
    SELECT 1 FROM account_restrictions WHERE user_id = v_row.user_id AND active AND restriction_type = 'tipping'
  ) THEN
    UPDATE user_profiles SET tipping_restricted = false WHERE id = v_row.user_id;
  ELSIF v_row.restriction_type = 'rewards_hold' AND NOT EXISTS (
    SELECT 1 FROM account_restrictions WHERE user_id = v_row.user_id AND active AND restriction_type = 'rewards_hold'
  ) THEN
    UPDATE user_profiles SET rewards_hold = false WHERE id = v_row.user_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_appeal(p_message text, p_case_id uuid DEFAULT NULL, p_restriction_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) < 5 THEN
    RETURN json_build_object('success', false, 'error', 'Please explain your appeal');
  END IF;

  INSERT INTO appeals (user_id, case_id, restriction_id, message)
  VALUES (v_uid, p_case_id, p_restriction_id, trim(p_message))
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_risk_event(uuid, text, integer, integer, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_withdrawal_risk(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_account_restriction(uuid, text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lift_account_restriction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_appeal(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, jsonb, text) TO authenticated;

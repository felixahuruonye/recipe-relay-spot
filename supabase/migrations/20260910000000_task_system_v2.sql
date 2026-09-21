-- ============================================================
-- LENORY TASK SYSTEM v2 — replaces the placeholder reward math
-- from the first pass with the actual configurable model, plus
-- everything from the full 25-point spec that wasn't built yet.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.task_provider_config (
  provider_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('offerwall', 'locker', 'advertising')),
  category TEXT NOT NULL DEFAULT 'offers',
  enabled BOOLEAN NOT NULL DEFAULT true,
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  postback_secret TEXT,
  api_credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency TEXT NOT NULL DEFAULT 'USD',
  user_reward_percent NUMERIC NOT NULL DEFAULT 50,
  platform_margin_percent NUMERIC NOT NULL DEFAULT 45,
  fraud_reserve_percent NUMERIC NOT NULL DEFAULT 5,
  stars_per_usd_user_share NUMERIC NOT NULL DEFAULT 50,
  min_reward_stars NUMERIC,
  max_reward_stars NUMERIC,
  min_seconds_before_valid INTEGER NOT NULL DEFAULT 90,
  country_availability TEXT[],
  min_age INTEGER NOT NULL DEFAULT 18,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.task_provider_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view enabled provider config" ON public.task_provider_config;
CREATE POLICY "Anyone can view enabled provider config" ON public.task_provider_config
  FOR SELECT USING (enabled = true AND NOT maintenance_mode);

INSERT INTO public.task_provider_config (provider_id, display_name, role, category, sort_order) VALUES
  ('monlix', 'Monlix', 'offerwall', 'offers', 1),
  ('mylead', 'MyLead', 'offerwall', 'surveys', 2),
  ('cpagrip', 'CPAGrip', 'locker', 'content', 3),
  ('ogads', 'OGAds', 'locker', 'content', 4),
  ('monetag', 'Monetag', 'advertising', 'tasks', 5)
ON CONFLICT (provider_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_networks') THEN
    INSERT INTO task_provider_config (provider_id, display_name, role, enabled, postback_secret)
    SELECT id, display_name, 'offerwall', enabled, postback_secret FROM task_networks
    ON CONFLICT (provider_id) DO UPDATE SET enabled = EXCLUDED.enabled, postback_secret = COALESCE(EXCLUDED.postback_secret, task_provider_config.postback_secret);
  END IF;
END $$;

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS age_locked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS device_tracking_consented BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS task_balance_pending NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS earning_restricted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS earning_restricted_reason TEXT;

CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_primary_for_user BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_user_devices_device ON public.user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON public.user_devices(user_id);
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own devices" ON public.user_devices;
CREATE POLICY "Users can view their own devices" ON public.user_devices
  FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_date_of_birth(p_user_id uuid, p_dob date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_locked_at timestamptz;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  SELECT age_locked_at INTO v_locked_at FROM user_profiles WHERE id = p_user_id;
  IF NOT v_is_admin AND v_locked_at IS NOT NULL AND now() < v_locked_at + interval '100 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Age can be changed again on ' || to_char(v_locked_at + interval '100 days', 'YYYY-MM-DD'));
  END IF;
  UPDATE user_profiles SET date_of_birth = p_dob, age_locked_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.register_device(p_user_id uuid, p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_existing_owner uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT user_id INTO v_existing_owner FROM user_devices
  WHERE device_id = p_device_id AND is_primary_for_user = true AND user_id <> p_user_id
  ORDER BY first_seen ASC LIMIT 1;

  INSERT INTO user_devices (user_id, device_id) VALUES (p_user_id, p_device_id)
  ON CONFLICT DO NOTHING;

  UPDATE user_profiles SET device_tracking_consented = true WHERE id = p_user_id;

  IF v_existing_owner IS NOT NULL THEN
    UPDATE user_profiles
    SET earning_restricted = true, earning_restricted_reason = 'Device already linked to another account'
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'restricted', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'restricted', false);
END; $$;

CREATE TABLE IF NOT EXISTS public.task_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES public.task_provider_config(provider_id),
  provider_transaction_id TEXT NOT NULL,
  offer_id TEXT,
  offer_name TEXT,
  provider_payout_usd NUMERIC NOT NULL DEFAULT 0,
  user_reward_percent_applied NUMERIC NOT NULL,
  platform_margin_percent_applied NUMERIC NOT NULL,
  fraud_reserve_percent_applied NUMERIC NOT NULL,
  user_reward_stars NUMERIC NOT NULL DEFAULT 0,
  platform_margin_usd NUMERIC NOT NULL DEFAULT 0,
  fraud_reserve_usd NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT,
  device_id TEXT,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked','pending','approved','available','reversed','rejected')),
  reversal_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  reversed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(provider_id, provider_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_task_ledger_user ON public.task_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_task_ledger_status ON public.task_ledger(provider_id, status);

ALTER TABLE public.task_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own ledger" ON public.task_ledger;
CREATE POLICY "Users can view their own ledger" ON public.task_ledger
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins can view all ledger entries" ON public.task_ledger;
CREATE POLICY "Admins can view all ledger entries" ON public.task_ledger
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.record_task_click_v2(p_provider_id text, p_offer_id text, p_ip text, p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile record;
  v_provider record;
  v_is_admin boolean;
  v_ledger_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  v_is_admin := public.has_role(v_uid, 'admin'::public.app_role);

  SELECT * INTO v_profile FROM user_profiles WHERE id = v_uid;
  SELECT * INTO v_provider FROM task_provider_config WHERE provider_id = p_provider_id;

  IF NOT v_is_admin THEN
    IF NOT EXISTS(SELECT 1 FROM task_rules_acceptance WHERE user_id = v_uid) THEN
      RETURN jsonb_build_object('success', false, 'error', 'rules_not_accepted');
    END IF;
    IF v_profile.earning_restricted THEN
      RETURN jsonb_build_object('success', false, 'error', 'earning_restricted');
    END IF;
    IF v_profile.date_of_birth IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'age_required');
    END IF;
    IF date_part('year', age(v_profile.date_of_birth)) < COALESCE(v_provider.min_age, 18) THEN
      RETURN jsonb_build_object('success', false, 'error', 'age_ineligible');
    END IF;
    IF v_provider.country_availability IS NOT NULL AND v_profile.country_code IS NOT NULL
       AND NOT (v_profile.country_code = ANY(v_provider.country_availability)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'country_ineligible');
    END IF;
    IF v_provider.role = 'advertising' THEN
      RETURN jsonb_build_object('success', false, 'error', 'not_a_task_provider');
    END IF;
  END IF;

  INSERT INTO user_ip_log (user_id, ip_address, context) VALUES (v_uid, p_ip, 'task_click');

  INSERT INTO task_ledger (user_id, provider_id, provider_transaction_id, offer_id, country, device_id, ip_address,
    user_reward_percent_applied, platform_margin_percent_applied, fraud_reserve_percent_applied, status)
  VALUES (v_uid, p_provider_id, 'pending-click-' || gen_random_uuid()::text, p_offer_id, v_profile.country_code, p_device_id, p_ip,
    v_provider.user_reward_percent, v_provider.platform_margin_percent, v_provider.fraud_reserve_percent, 'clicked')
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object('success', true, 'click_id', v_ledger_id);
END; $$;

CREATE OR REPLACE FUNCTION public.process_task_postback(
  p_provider_id text, p_click_id uuid, p_provider_transaction_id text,
  p_payout_usd numeric, p_status text, p_offer_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row record;
  v_provider record;
  v_stars numeric;
  v_seconds numeric;
  v_final_status text;
BEGIN
  SELECT * INTO v_row FROM task_ledger WHERE id = p_click_id;
  IF v_row IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_click_id'); END IF;

  IF v_row.status IN ('approved', 'available', 'reversed', 'rejected')
     AND v_row.provider_transaction_id = p_provider_transaction_id THEN
    RETURN jsonb_build_object('success', true, 'note', 'already_processed');
  END IF;

  SELECT * INTO v_provider FROM task_provider_config WHERE provider_id = p_provider_id;
  v_seconds := EXTRACT(EPOCH FROM (now() - v_row.created_at));

  IF p_status IN ('reversed', 'chargeback', 'rejected') THEN
    UPDATE user_profiles SET star_balance = GREATEST(0, star_balance - v_row.user_reward_stars) WHERE id = v_row.user_id;
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (v_row.user_id, 'task_reversal', -v_row.user_reward_stars, 'stars',
      jsonb_build_object('provider', p_provider_id, 'ledger_id', p_click_id, 'reason', p_status));
    UPDATE task_ledger SET status = 'reversed', reversed_at = now(), reversal_reason = p_status,
      provider_transaction_id = p_provider_transaction_id
      WHERE id = p_click_id;
    RETURN jsonb_build_object('success', true, 'note', 'reversed_and_deducted');
  END IF;

  IF v_seconds < COALESCE(v_provider.min_seconds_before_valid, 90) THEN
    INSERT INTO fraud_flags (user_id, flag_type, severity, details)
    VALUES (v_row.user_id, 'task_completed_too_fast', 'medium',
      jsonb_build_object('provider', p_provider_id, 'seconds', v_seconds));
  END IF;
  IF p_payout_usd IS NULL OR p_payout_usd <= 0 THEN
    INSERT INTO fraud_flags (user_id, flag_type, severity, details)
    VALUES (v_row.user_id, 'zero_payout_completion', 'low',
      jsonb_build_object('provider', p_provider_id, 'ledger_id', p_click_id));
  END IF;

  v_stars := COALESCE(p_payout_usd, 0) * (v_row.user_reward_percent_applied / 100.0) * COALESCE(v_provider.stars_per_usd_user_share, 50);
  IF v_provider.min_reward_stars IS NOT NULL THEN v_stars := GREATEST(v_stars, v_provider.min_reward_stars); END IF;
  IF v_provider.max_reward_stars IS NOT NULL THEN v_stars := LEAST(v_stars, v_provider.max_reward_stars); END IF;
  v_stars := ROUND(v_stars, 2);

  v_final_status := CASE WHEN p_status = 'pending' THEN 'pending' ELSE 'approved' END;

  UPDATE task_ledger SET
    status = v_final_status,
    provider_transaction_id = p_provider_transaction_id,
    offer_name = COALESCE(p_offer_name, offer_name),
    provider_payout_usd = COALESCE(p_payout_usd, 0),
    user_reward_stars = v_stars,
    platform_margin_usd = COALESCE(p_payout_usd, 0) * (v_row.platform_margin_percent_applied / 100.0),
    fraud_reserve_usd = COALESCE(p_payout_usd, 0) * (v_row.fraud_reserve_percent_applied / 100.0),
    approved_at = CASE WHEN v_final_status = 'approved' THEN now() ELSE NULL END
  WHERE id = p_click_id;

  IF v_final_status = 'pending' THEN
    UPDATE user_profiles SET task_balance_pending = task_balance_pending + v_stars WHERE id = v_row.user_id;
  ELSE
    UPDATE user_profiles SET star_balance = star_balance + v_stars,
      task_balance_pending = GREATEST(0, task_balance_pending - v_stars)
      WHERE id = v_row.user_id;
    INSERT INTO wallet_history (user_id, type, amount, currency, meta)
    VALUES (v_row.user_id, 'task_reward', v_stars, 'stars',
      jsonb_build_object('provider', p_provider_id, 'ledger_id', p_click_id, 'payout_usd', p_payout_usd));
  END IF;

  RETURN jsonb_build_object('success', true, 'stars_credited', v_stars, 'status', v_final_status);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_provider_config(
  p_provider_id text, p_enabled boolean DEFAULT NULL, p_maintenance_mode boolean DEFAULT NULL,
  p_user_reward_percent numeric DEFAULT NULL, p_platform_margin_percent numeric DEFAULT NULL,
  p_fraud_reserve_percent numeric DEFAULT NULL, p_stars_per_usd_user_share numeric DEFAULT NULL,
  p_min_reward_stars numeric DEFAULT NULL, p_max_reward_stars numeric DEFAULT NULL,
  p_min_age integer DEFAULT NULL, p_featured boolean DEFAULT NULL, p_sort_order integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE task_provider_config SET
    enabled = COALESCE(p_enabled, enabled),
    maintenance_mode = COALESCE(p_maintenance_mode, maintenance_mode),
    user_reward_percent = COALESCE(p_user_reward_percent, user_reward_percent),
    platform_margin_percent = COALESCE(p_platform_margin_percent, platform_margin_percent),
    fraud_reserve_percent = COALESCE(p_fraud_reserve_percent, fraud_reserve_percent),
    stars_per_usd_user_share = COALESCE(p_stars_per_usd_user_share, stars_per_usd_user_share),
    min_reward_stars = COALESCE(p_min_reward_stars, min_reward_stars),
    max_reward_stars = COALESCE(p_max_reward_stars, max_reward_stars),
    min_age = COALESCE(p_min_age, min_age),
    featured = COALESCE(p_featured, featured),
    sort_order = COALESCE(p_sort_order, sort_order)
  WHERE provider_id = p_provider_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_earning_restricted(p_user_id uuid, p_restricted boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE user_profiles SET earning_restricted = p_restricted,
    earning_restricted_reason = CASE WHEN p_restricted THEN p_reason ELSE NULL END
    WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_task_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_providers jsonb;
  v_activity jsonb;
  v_revenue jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_providers FROM task_provider_config p;

  SELECT jsonb_build_object(
    'clicked', count(*) FILTER (WHERE status = 'clicked'),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'approved', count(*) FILTER (WHERE status = 'approved'),
    'reversed', count(*) FILTER (WHERE status = 'reversed'),
    'rejected', count(*) FILTER (WHERE status = 'rejected')
  ) INTO v_activity FROM task_ledger;

  SELECT jsonb_build_object(
    'provider_payout_usd', COALESCE(sum(provider_payout_usd), 0),
    'platform_margin_usd', COALESCE(sum(platform_margin_usd), 0),
    'fraud_reserve_usd', COALESCE(sum(fraud_reserve_usd), 0),
    'user_reward_stars', COALESCE(sum(user_reward_stars) FILTER (WHERE status IN ('approved','available')), 0)
  ) INTO v_revenue FROM task_ledger;

  RETURN jsonb_build_object('providers', v_providers, 'activity', v_activity, 'revenue', v_revenue);
END; $$;

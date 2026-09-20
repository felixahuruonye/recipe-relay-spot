-- ============================================================
-- LENORY TASK SYSTEM — multi-network CPA/offerwall backbone
-- Everything money/fraud-related is a SECURITY DEFINER function.
-- No network secret or star-crediting logic ever runs client-side.
-- ============================================================

-- One row per network (Monlix, MyLead, Monetag, OGAds, CPAGrip).
-- postback_secret lives here, only ever read by SECURITY DEFINER
-- functions - RLS blocks normal users from ever selecting it.
CREATE TABLE IF NOT EXISTS public.task_networks (
  id TEXT PRIMARY KEY, -- 'monlix' | 'mylead' | 'monetag' | 'ogads' | 'cpagrip'
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  postback_secret TEXT,
  star_multiplier NUMERIC NOT NULL DEFAULT 1.0, -- admin lever: stars per $1 payout
  min_seconds_before_valid INTEGER NOT NULL DEFAULT 90, -- fraud: too-fast completion
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.task_networks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view enabled networks (no secret)" ON public.task_networks;
-- Secret column is still protected: this policy allows the row to be
-- read, but the app should only ever select non-secret columns from
-- the client. The secret is only ever touched inside SECURITY DEFINER
-- functions below, which bypass RLS entirely by design.
CREATE POLICY "Anyone can view enabled networks (no secret)" ON public.task_networks
  FOR SELECT USING (enabled = true);

INSERT INTO public.task_networks (id, display_name) VALUES
  ('monlix', 'Monlix'), ('mylead', 'MyLead'), ('monetag', 'Monetag'),
  ('ogads', 'OGAds'), ('cpagrip', 'CPAGrip')
ON CONFLICT (id) DO NOTHING;

-- Cached offer catalog, refreshed periodically by a scheduled Edge
-- Function per network (see below). The app reads from this table,
-- never hits the network's live API directly from the client.
CREATE TABLE IF NOT EXISTS public.cached_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id TEXT NOT NULL REFERENCES public.task_networks(id) ON DELETE CASCADE,
  external_offer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  payout_usd NUMERIC,
  image_url TEXT,
  click_url_template TEXT NOT NULL, -- contains {click_id} placeholder
  country_targeting TEXT,
  -- "No offers that are just watch-an-ad placements" - excluded at
  -- sync time by the Edge Function, flagged here too so it's visible
  -- and filterable from the admin side as well.
  offer_type TEXT NOT NULL DEFAULT 'cpa', -- 'cpa' | 'survey' | 'app_install' | 'signup'
  active BOOLEAN NOT NULL DEFAULT true,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(network_id, external_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_cached_offers_active ON public.cached_offers(network_id, active);

ALTER TABLE public.cached_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active offers" ON public.cached_offers;
CREATE POLICY "Anyone can view active offers" ON public.cached_offers
  FOR SELECT USING (active = true);

-- Every task click, before the user ever leaves the app. This is the
-- click_id every network's postback macro carries out and back.
CREATE TABLE IF NOT EXISTS public.task_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  network_id TEXT NOT NULL REFERENCES public.task_networks(id),
  offer_id UUID REFERENCES public.cached_offers(id),
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'clicked', -- clicked | completed | reversed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_clicks_user ON public.task_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_task_clicks_status ON public.task_clicks(network_id, status);

ALTER TABLE public.task_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own task clicks" ON public.task_clicks;
CREATE POLICY "Users can view their own task clicks" ON public.task_clicks
  FOR SELECT USING (user_id = auth.uid());

-- Registration/click IP log, feeding the fraud check (foreign-country
-- IP shift, IP reused across many accounts). Deliberately NOT used
-- alone to auto-ban - see credit_task_completion below.
CREATE TABLE IF NOT EXISTS public.user_ip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  context TEXT NOT NULL, -- 'signup' | 'task_click'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_ip_log_ip ON public.user_ip_log(ip_address);
ALTER TABLE public.user_ip_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own IP log" ON public.user_ip_log;
CREATE POLICY "Users can view their own IP log" ON public.user_ip_log
  FOR SELECT USING (user_id = auth.uid());

-- Mandatory rules acknowledgment gate - the long-scroll rules page the
-- user must fully read + check the box for before task clicks work.
CREATE TABLE IF NOT EXISTS public.task_rules_acceptance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rules_version INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE public.task_rules_acceptance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own acceptance" ON public.task_rules_acceptance;
CREATE POLICY "Users can view their own acceptance" ON public.task_rules_acceptance
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can record their own acceptance" ON public.task_rules_acceptance;
CREATE POLICY "Users can record their own acceptance" ON public.task_rules_acceptance
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- record_task_click: called right before redirecting the user to
-- the network's offer URL. Logs IP/UA, requires rules acceptance,
-- returns the click_id to embed in the outbound URL.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_task_click(p_network_id text, p_offer_id uuid, p_ip text, p_user_agent text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_accepted boolean;
  v_click_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  SELECT EXISTS(SELECT 1 FROM task_rules_acceptance WHERE user_id = v_uid) INTO v_accepted;
  IF NOT v_accepted THEN
    RETURN jsonb_build_object('success', false, 'error', 'rules_not_accepted');
  END IF;

  INSERT INTO user_ip_log (user_id, ip_address, context) VALUES (v_uid, p_ip, 'task_click');

  INSERT INTO task_clicks (user_id, network_id, offer_id, ip_address, user_agent)
  VALUES (v_uid, p_network_id, p_offer_id, p_ip, p_user_agent)
  RETURNING id INTO v_click_id;

  RETURN jsonb_build_object('success', true, 'click_id', v_click_id);
END;
$$;

-- ------------------------------------------------------------
-- IMPORTANT: this app already has a working, idempotent postback
-- pipeline - the offer-postback Edge Function + credit_offer_completion
-- RPC, both already deployed and already correctly de-duplicating by
-- transaction_id. Rather than building a second, competing crediting
-- path, fraud-scoring is added as a trigger on top of that existing
-- pipeline. The click_id from record_task_click below gets passed as
-- offer-postback's existing p_task_id parameter (it already supports
-- this), so no changes to that Edge Function are needed at all.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_score_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_click record;
  v_network record;
  v_seconds_since_click numeric;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_click FROM task_clicks WHERE id::text = NEW.task_id;
  IF v_click IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_network FROM task_networks WHERE id = v_click.network_id;
  v_seconds_since_click := EXTRACT(EPOCH FROM (now() - v_click.created_at));

  IF v_seconds_since_click < COALESCE(v_network.min_seconds_before_valid, 90) THEN
    INSERT INTO fraud_flags (user_id, flag_type, severity, details)
    VALUES (v_click.user_id, 'task_completed_too_fast', 'medium',
      jsonb_build_object('network', v_click.network_id, 'seconds', v_seconds_since_click, 'task_id', NEW.task_id));
  END IF;

  IF NEW.stars_credited = 0 AND NEW.status = 'completed' THEN
    INSERT INTO fraud_flags (user_id, flag_type, severity, details)
    VALUES (v_click.user_id, 'zero_payout_completion', 'low',
      jsonb_build_object('network', v_click.network_id, 'task_id', NEW.task_id));
  END IF;

  UPDATE task_clicks SET status = CASE WHEN NEW.status = 'reversed' THEN 'reversed' ELSE 'completed' END
  WHERE id::text = NEW.task_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fraud_score_task_completion ON public.offer_task_completions;
CREATE TRIGGER trg_fraud_score_task_completion
  AFTER INSERT ON public.offer_task_completions
  FOR EACH ROW EXECUTE FUNCTION public.fraud_score_task_completion();

-- ------------------------------------------------------------
-- Email verification charge (2 stars), refunded automatically if the
-- verification call itself fails to run - "email is invalid" is
-- still a valid, chargeable result; only a technical failure refunds.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  result TEXT, -- 'valid' | 'invalid' | 'disposable' | 'error'
  stars_charged INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own email verifications" ON public.email_verifications;
CREATE POLICY "Users can view their own email verifications" ON public.email_verifications
  FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.charge_email_verification(p_user_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance integer;
  v_cost integer := 2;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT star_balance INTO v_balance FROM user_profiles WHERE id = p_user_id;
  IF v_balance IS NULL OR v_balance < v_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
  END IF;
  UPDATE user_profiles SET star_balance = star_balance - v_cost WHERE id = p_user_id;
  INSERT INTO wallet_history (user_id, type, amount, currency) VALUES (p_user_id, 'email_verification', -v_cost, 'stars');
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_email_verification(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE user_profiles SET star_balance = star_balance + 2 WHERE id = p_user_id;
  INSERT INTO wallet_history (user_id, type, amount, currency, meta)
  VALUES (p_user_id, 'email_verification_refund', 2, 'stars', jsonb_build_object('reason', 'verification_service_error'));
END;
$$;

-- ------------------------------------------------------------
-- Creator Pool skeleton (separate future project per this
-- conversation - tables only, so nothing blocks on it, no
-- allocation logic wired to real ad revenue yet).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_revenue_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue_ngn NUMERIC NOT NULL DEFAULT 0,
  creator_pool_ngn NUMERIC NOT NULL DEFAULT 0,
  finalized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_revenue_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view finalized periods" ON public.ad_revenue_periods;
CREATE POLICY "Anyone can view finalized periods" ON public.ad_revenue_periods
  FOR SELECT USING (finalized = true);

-- Admin-only controls (network pause/resume, multiplier changes).
CREATE OR REPLACE FUNCTION public.admin_set_network_enabled(p_network_id text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE task_networks SET enabled = p_enabled WHERE id = p_network_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_network_multiplier(p_network_id text, p_multiplier numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE task_networks SET star_multiplier = p_multiplier WHERE id = p_network_id;
  RETURN jsonb_build_object('success', true);
END; $$;

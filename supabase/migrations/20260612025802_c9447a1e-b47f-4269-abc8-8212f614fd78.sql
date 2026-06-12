
-- 1. Extend user_profiles with new balance columns (additive, won't break existing)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS silver_star_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_star_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_wallet_ngn numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_wallet_ngn numeric(14,4) NOT NULL DEFAULT 0;

-- 2. ad_impressions: every AdSterra ad view we record
CREATE TABLE IF NOT EXISTS public.ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  network text NOT NULL DEFAULT 'adsterra',
  placement text NOT NULL,           -- 'fullscreen_silver', 'feed_video', 'story', etc
  ngn_payout numeric(14,4) NOT NULL DEFAULT 0,
  silver_credited integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'counted', -- counted | rejected | pending
  ip_address text,
  user_agent text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ad_impressions TO authenticated;
GRANT ALL ON public.ad_impressions TO service_role;

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ad impressions"
  ON public.ad_impressions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages ad impressions"
  ON public.ad_impressions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ad_impressions_user_created_idx
  ON public.ad_impressions (user_id, created_at DESC);

-- 3. silver_star_transactions: credit + tip ledger with revenue splits
CREATE TABLE IF NOT EXISTS public.silver_star_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_type text NOT NULL,             -- 'credit' (earned from ad) | 'tip' (spent on creator)
  amount_stars integer NOT NULL,     -- silver stars (+ or -)
  pool_ngn numeric(14,4) NOT NULL DEFAULT 0,
  creator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  creator_amount_ngn numeric(14,4) NOT NULL DEFAULT 0,
  viewer_cashback_ngn numeric(14,4) NOT NULL DEFAULT 0,
  sound_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sound_owner_amount_ngn numeric(14,4) NOT NULL DEFAULT 0,
  platform_amount_ngn numeric(14,4) NOT NULL DEFAULT 0,
  post_id uuid,
  ad_impression_id uuid REFERENCES public.ad_impressions(id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.silver_star_transactions TO authenticated;
GRANT ALL ON public.silver_star_transactions TO service_role;

ALTER TABLE public.silver_star_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own silver tx"
  ON public.silver_star_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = creator_id OR auth.uid() = sound_owner_id);

CREATE POLICY "Service role manages silver tx"
  ON public.silver_star_transactions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS silver_tx_user_created_idx
  ON public.silver_star_transactions (user_id, created_at DESC);

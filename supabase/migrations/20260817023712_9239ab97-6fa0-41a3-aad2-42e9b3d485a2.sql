-- Offer wall tasks
CREATE TABLE IF NOT EXISTS public.offer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'CUSTOM',
  title text NOT NULL,
  description text,
  instructions text,
  payout_stars integer NOT NULL DEFAULT 0,
  payout_naira numeric NOT NULL DEFAULT 0,
  est_minutes integer NOT NULL DEFAULT 3,
  url text,
  image_url text,
  category text NOT NULL DEFAULT 'offer',
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.offer_tasks TO anon;
GRANT SELECT ON public.offer_tasks TO authenticated;
GRANT ALL ON public.offer_tasks TO service_role;
ALTER TABLE public.offer_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offer_tasks_public_read" ON public.offer_tasks;
CREATE POLICY "offer_tasks_public_read" ON public.offer_tasks FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "offer_tasks_admin_write" ON public.offer_tasks;
CREATE POLICY "offer_tasks_admin_write" ON public.offer_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT INSERT, UPDATE, DELETE ON public.offer_tasks TO authenticated;

-- Completions / attempts ledger
CREATE TABLE IF NOT EXISTS public.offer_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text,
  task_id uuid REFERENCES public.offer_tasks(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'CUSTOM',
  task_title text,
  status text NOT NULL DEFAULT 'started',
  stars_credited integer NOT NULL DEFAULT 0,
  naira_credited numeric NOT NULL DEFAULT 0,
  transaction_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_otc_user ON public.offer_task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_otc_status ON public.offer_task_completions(status, created_at DESC);

GRANT SELECT ON public.offer_task_completions TO anon;
GRANT SELECT, INSERT ON public.offer_task_completions TO authenticated;
GRANT ALL ON public.offer_task_completions TO service_role;
ALTER TABLE public.offer_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "otc_public_completed_read" ON public.offer_task_completions;
CREATE POLICY "otc_public_completed_read" ON public.offer_task_completions FOR SELECT USING (status = 'completed');
DROP POLICY IF EXISTS "otc_own_read" ON public.offer_task_completions;
CREATE POLICY "otc_own_read" ON public.offer_task_completions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "otc_own_insert" ON public.offer_task_completions;
CREATE POLICY "otc_own_insert" ON public.offer_task_completions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Start a task (records the click)
CREATE OR REPLACE FUNCTION public.start_offer_task(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.offer_tasks%ROWTYPE;
  v_username text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_task FROM public.offer_tasks WHERE id = p_task_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'task_not_found');
  END IF;
  SELECT username INTO v_username FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.offer_task_completions (user_id, username, task_id, provider, task_title, status)
  VALUES (auth.uid(), v_username, p_task_id, v_task.provider, v_task.title, 'started');

  RETURN jsonb_build_object('success', true, 'url', v_task.url);
END;
$$;

-- Credit a completion (service role / postback, or platform task auto-approve)
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
    INSERT INTO public.wallet_history (user_id, amount, type, description)
    VALUES (p_user_id, p_naira, 'offer_earn', COALESCE(p_task_title, 'Offer reward'));
  END IF;

  INSERT INTO public.user_notifications (user_id, title, message, type)
  VALUES (p_user_id, 'Task reward credited',
          'You earned ' || GREATEST(p_stars,0) || ' Stars for "' || COALESCE(p_task_title, 'a task') || '"', 'earning');

  RETURN jsonb_build_object('success', true, 'stars', GREATEST(p_stars,0), 'naira', GREATEST(p_naira,0));
END;
$$;

-- Claim a platform (CUSTOM) task once
CREATE OR REPLACE FUNCTION public.claim_platform_task(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.offer_tasks%ROWTYPE;
  v_started timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  SELECT * INTO v_task FROM public.offer_tasks WHERE id = p_task_id AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'task_not_found');
  END IF;
  IF v_task.provider <> 'CUSTOM' THEN
    RETURN jsonb_build_object('success', false, 'error', 'network_task_auto_credits');
  END IF;
  IF EXISTS (SELECT 1 FROM public.offer_task_completions
             WHERE user_id = auth.uid() AND task_id = p_task_id AND status = 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_completed');
  END IF;

  SELECT created_at INTO v_started FROM public.offer_task_completions
   WHERE user_id = auth.uid() AND task_id = p_task_id AND status = 'started'
   ORDER BY created_at DESC LIMIT 1;

  IF v_started IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_started');
  END IF;
  IF now() - v_started < make_interval(secs => GREATEST(v_task.est_minutes, 1) * 20) THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_soon');
  END IF;

  RETURN public.credit_offer_completion(
    auth.uid(), p_task_id, 'CUSTOM', v_task.title,
    v_task.payout_stars, v_task.payout_naira,
    'custom-' || p_task_id::text || '-' || auth.uid()::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_offer_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_platform_task(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_offer_completion(uuid, uuid, text, text, integer, numeric, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_offer_completion(uuid, uuid, text, text, integer, numeric, text) TO service_role;

-- Seed the 5 CPA network placeholders + starter platform tasks
INSERT INTO public.offer_tasks (provider, title, description, payout_stars, payout_naira, est_minutes, url, category, featured)
SELECT * FROM (VALUES
  ('MONLIX', 'Monlix Survey Wall', 'Answer short surveys and get paid per completion.', 250, 0, 5, 'https://wall.monlix.com/', 'survey', true),
  ('OGADS', 'OGAds App Installs', 'Install a sponsored app and open it for 30 seconds.', 150, 0, 3, 'https://ogads.com/', 'install', false),
  ('MYLEAD', 'MyLead Signups', 'Register on a partner site to unlock the reward.', 200, 0, 4, 'https://mylead.global/', 'signup', false),
  ('MONETAG', 'Monetag Quick Tasks', 'Simple click and browse tasks that pay instantly.', 80, 0, 2, 'https://monetag.com/', 'browse', false),
  ('CPAGRIP', 'CPAGrip Content Locker', 'Complete one offer to unlock premium rewards.', 180, 0, 4, 'https://cpagrip.com/', 'locker', false),
  ('CUSTOM', 'Invite 1 friend to Lenory', 'Share your invite link and bring one new creator on board.', 60, 0, 3, '/share', 'platform', true),
  ('CUSTOM', 'Post your first video today', 'Upload a video post to the For You feed.', 40, 0, 5, '/?create=post', 'platform', false),
  ('CUSTOM', 'Follow 5 creators', 'Discover and follow 5 creators you enjoy.', 25, 0, 2, '/explore', 'platform', false)
) AS t(provider, title, description, payout_stars, payout_naira, est_minutes, url, category, featured)
WHERE NOT EXISTS (SELECT 1 FROM public.offer_tasks);
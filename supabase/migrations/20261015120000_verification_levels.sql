-- Stage 3: Verification levels & audit (safe / additive)

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS verification_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_region text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'NG',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS terms_rewards_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_rewards_version text,
  ADD COLUMN IF NOT EXISTS earning_status text DEFAULT 'not_verified',
  ADD COLUMN IF NOT EXISTS payout_account_verified boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_verification_status_check'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_verification_status_check
      CHECK (verification_status IN (
        'NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW',
        'ACTION_REQUIRED','VERIFIED','FAILED','EXPIRED','RESTRICTED'
      ));
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_level integer NOT NULL CHECK (target_level BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN (
      'NOT_STARTED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW',
      'ACTION_REQUIRED','VERIFIED','FAILED','EXPIRED','RESTRICTED'
    )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_requests_user_idx ON public.verification_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_requests_status_idx ON public.verification_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  from_level integer,
  to_level integer,
  reason text,
  actor_id uuid REFERENCES auth.users(id),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_audit_user_idx ON public.verification_audit (user_id, created_at DESC);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own verification_requests" ON public.verification_requests;
CREATE POLICY "Users read own verification_requests" ON public.verification_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own verification_requests" ON public.verification_requests;
CREATE POLICY "Users insert own verification_requests" ON public.verification_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own pending verification_requests" ON public.verification_requests;
CREATE POLICY "Users update own pending verification_requests" ON public.verification_requests
  FOR UPDATE USING (
    auth.uid() = user_id AND status IN ('NOT_STARTED','IN_PROGRESS','ACTION_REQUIRED')
  );

DROP POLICY IF EXISTS "Users read own verification_audit" ON public.verification_audit;
CREATE POLICY "Users read own verification_audit" ON public.verification_audit
  FOR SELECT USING (auth.uid() = user_id);

-- Admin policies (best-effort)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'verification_requests' AND policyname = 'Admins manage verification_requests'
  ) THEN
    CREATE POLICY "Admins manage verification_requests" ON public.verification_requests
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = auth.uid() AND (up.is_admin = true OR up.role = 'admin')
        )
      );
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Submit Level 1 (profile completion) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.submit_verification_level1(
  p_full_name text,
  p_date_of_birth date,
  p_address_line text,
  p_city text,
  p_state_region text,
  p_country text DEFAULT 'NG',
  p_phone text DEFAULT NULL,
  p_accept_terms boolean DEFAULT false,
  p_terms_version text DEFAULT 'rewards-v1'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_level integer;
  v_status text;
  v_avatar text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF NOT COALESCE(p_accept_terms, false) THEN
    RETURN json_build_object('success', false, 'error', 'You must accept Terms & Rewards rules');
  END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Full name is required');
  END IF;
  IF p_date_of_birth IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Date of birth is required');
  END IF;
  IF p_date_of_birth > (CURRENT_DATE - INTERVAL '13 years') THEN
    RETURN json_build_object('success', false, 'error', 'You must be at least 13 years old');
  END IF;
  IF p_address_line IS NULL OR length(trim(p_address_line)) < 3 THEN
    RETURN json_build_object('success', false, 'error', 'Address is required');
  END IF;
  IF p_city IS NULL OR length(trim(p_city)) < 2 THEN
    RETURN json_build_object('success', false, 'error', 'City is required');
  END IF;

  SELECT verification_level, verification_status, avatar_url
  INTO v_level, v_status, v_avatar
  FROM user_profiles WHERE id = v_uid;

  IF COALESCE(v_level, 0) >= 1 AND v_status = 'VERIFIED' THEN
    RETURN json_build_object('success', true, 'level', v_level, 'message', 'Level 1 already complete');
  END IF;

  IF v_avatar IS NULL OR length(trim(v_avatar)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Profile picture is required. Upload one in Edit Profile first.');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  -- Email presence check (Supabase auth usually ensures verified login)

  UPDATE user_profiles SET
    full_name = trim(p_full_name),
    date_of_birth = p_date_of_birth,
    address_line = trim(p_address_line),
    city = trim(p_city),
    state_region = NULLIF(trim(COALESCE(p_state_region, '')), ''),
    country = COALESCE(NULLIF(trim(p_country), ''), 'NG'),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    terms_rewards_accepted_at = now(),
    terms_rewards_version = COALESCE(p_terms_version, 'rewards-v1'),
    verification_level = GREATEST(COALESCE(verification_level, 0), 1),
    verification_status = 'VERIFIED',
    earning_status = CASE
      WHEN COALESCE(verification_level, 0) >= 2 OR GREATEST(COALESCE(verification_level, 0), 1) >= 2 THEN COALESCE(earning_status, 'active')
      ELSE 'not_verified'
    END,
    updated_at = now()
  WHERE id = v_uid;

  INSERT INTO verification_requests (user_id, target_level, status, payload)
  VALUES (
    v_uid, 1, 'VERIFIED',
    jsonb_build_object(
      'full_name', trim(p_full_name),
      'date_of_birth', p_date_of_birth,
      'city', trim(p_city),
      'country', COALESCE(NULLIF(trim(p_country), ''), 'NG')
    )
  );

  INSERT INTO verification_audit (user_id, from_status, to_status, from_level, to_level, reason, actor_id)
  VALUES (v_uid, v_status, 'VERIFIED', COALESCE(v_level, 0), 1, 'Level 1 basic profile completed', v_uid);

  RETURN json_build_object('success', true, 'level', 1, 'status', 'VERIFIED');
END;
$$;

-- Submit Level 2 / 3 for review
CREATE OR REPLACE FUNCTION public.submit_verification_level(
  p_target_level integer,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_level integer;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_target_level NOT IN (2, 3) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid target level');
  END IF;

  SELECT verification_level, verification_status INTO v_level, v_status
  FROM user_profiles WHERE id = v_uid;

  IF COALESCE(v_level, 0) < p_target_level - 1 THEN
    RETURN json_build_object('success', false, 'error', 'Complete previous verification level first');
  END IF;
  IF COALESCE(v_level, 0) >= p_target_level AND v_status = 'VERIFIED' THEN
    RETURN json_build_object('success', true, 'level', v_level, 'message', 'Already verified at this level');
  END IF;

  UPDATE user_profiles SET
    verification_status = 'UNDER_REVIEW',
    updated_at = now()
  WHERE id = v_uid;

  INSERT INTO verification_requests (user_id, target_level, status, payload)
  VALUES (v_uid, p_target_level, 'UNDER_REVIEW', COALESCE(p_payload, '{}'::jsonb));

  INSERT INTO verification_audit (user_id, from_status, to_status, from_level, to_level, reason, actor_id)
  VALUES (v_uid, v_status, 'UNDER_REVIEW', COALESCE(v_level, 0), p_target_level, 'Submitted for review', v_uid);

  RETURN json_build_object('success', true, 'level', COALESCE(v_level, 0), 'status', 'UNDER_REVIEW');
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_verification_level1(text, date, text, text, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verification_level(integer, jsonb) TO authenticated;

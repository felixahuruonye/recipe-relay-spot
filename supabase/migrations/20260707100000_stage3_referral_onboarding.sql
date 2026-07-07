-- Stage 3: referral capture + two-step follow-gate + welcome flow

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.user_profiles(id);

-- Capture the referral code (first 8 chars of referrer's id, passed as
-- signUp user metadata) at account-creation time, and resolve it to an
-- actual referred_by user id if one matches.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_code text;
  v_referrer_id uuid;
BEGIN
  v_ref_code := NEW.raw_user_meta_data->>'ref';
  IF v_ref_code IS NOT NULL AND length(v_ref_code) > 0 THEN
    SELECT id INTO v_referrer_id FROM public.user_profiles
    WHERE id::text ILIKE v_ref_code || '%' LIMIT 1;
  END IF;

  INSERT INTO public.user_profiles (id, username, full_name, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substring(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_referrer_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Public (no-login-required) lookup used by the onboarding follow-gate to
-- show the referrer's profile card, without needing to loosen user_profiles' RLS.
CREATE OR REPLACE FUNCTION public.resolve_referrer(p_id_prefix text)
RETURNS TABLE(id uuid, username text, avatar_url text, bio text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id, username, avatar_url, bio
  FROM public.user_profiles
  WHERE id::text ILIKE p_id_prefix || '%'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_referrer(text) TO anon, authenticated;

-- Finds the app's official/founder account by trying a few likely username
-- variants, so the follow-gate works regardless of exactly how the account
-- is spelled. Update the candidate list here if the real username differs.
CREATE OR REPLACE FUNCTION public.resolve_founder_account()
RETURNS TABLE(id uuid, username text, avatar_url text, bio text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT id, username, avatar_url, bio
  FROM public.user_profiles
  WHERE lower(replace(username, ' ', '')) IN (
    'felixahuruonye', 'lenorysocial', 'lenory_social', 'lenory'
  )
  ORDER BY
    CASE lower(replace(username, ' ', ''))
      WHEN 'lenorysocial' THEN 0
      WHEN 'lenory_social' THEN 0
      WHEN 'felixahuruonye' THEN 1
      ELSE 2
    END
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_founder_account() TO anon, authenticated;

-- Lets a user mark their own onboarding as complete (used after the
-- follow-gate + welcome card, right before they land on the feed).
CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.user_profiles SET onboarding_completed = true WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;

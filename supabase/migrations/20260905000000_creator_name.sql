-- Track when full_name (shown in the app as "Creator Name") was last
-- changed, so we can enforce a 90-day cooldown between edits. NULL means
-- the user has never set/changed it yet (via this RPC), so their first
-- edit is always free regardless of how long ago they signed up.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS full_name_updated_at TIMESTAMP WITH TIME ZONE;

-- Updates a user's Creator Name (full_name).
-- - The user themselves may change it once every 90 days.
-- - The very first time it's set (full_name_updated_at IS NULL) is free,
--   so both brand-new signups and existing users filling it in for the
--   first time are never blocked by the cooldown.
-- - Admins (has_role(..., 'admin')) can change anyone's name at any time,
--   bypassing the cooldown entirely.
CREATE OR REPLACE FUNCTION public.update_full_name(p_user_id uuid, p_full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin boolean;
  v_last_updated timestamptz;
  v_next_allowed timestamptz;
  v_clean_name text := trim(p_full_name);
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);

  IF NOT v_is_admin AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_clean_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Name cannot be empty');
  END IF;

  IF NOT v_is_admin THEN
    SELECT full_name_updated_at INTO v_last_updated FROM user_profiles WHERE id = p_user_id;
    IF v_last_updated IS NOT NULL THEN
      v_next_allowed := v_last_updated + interval '90 days';
      IF now() < v_next_allowed THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'You can change your name again on ' || to_char(v_next_allowed, 'YYYY-MM-DD'),
          'next_allowed_at', v_next_allowed
        );
      END IF;
    END IF;
  END IF;

  UPDATE user_profiles
  SET full_name = v_clean_name, full_name_updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

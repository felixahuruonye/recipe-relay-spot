-- ============================================================
-- LENORY DEVICE SECURITY HARDENING
-- Replaces the placeholder localStorage device_id with real
-- browser/hardware fingerprint signals collected via a secure
-- edge function. Adds admin-only device visibility/deletion.
-- Also separates Monetag (advertising) from the earn category
-- tabs per the spec.
-- ============================================================

-- Real fingerprint signal columns (previously only had device_id + first_seen)
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS screen_resolution TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS hardware_concurrency INTEGER;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS device_memory NUMERIC;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS touch_support BOOLEAN;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- One row per (user, device) so repeat visits update last_seen instead of
-- silently multiplying rows forever.
DO $$
BEGIN
  ALTER TABLE public.user_devices ADD CONSTRAINT user_devices_user_device_unique UNIQUE (user_id, device_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Client apps must never write user_devices directly (that's the whole
-- point of moving this behind register-device edge function + service
-- role). RLS already only grants SELECT for the owning user; there are
-- deliberately no INSERT/UPDATE/DELETE policies for authenticated users.

-- ------------------------------------------------------------
-- Admin: list every device on file, flagging ones linked to more
-- than one account (the actual fraud signal).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_devices()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb) INTO v_result FROM (
    SELECT
      ud.id,
      ud.user_id,
      up.username,
      ud.device_id,
      ud.user_agent,
      ud.platform,
      ud.screen_resolution,
      ud.timezone,
      ud.language,
      ud.first_seen,
      ud.last_seen,
      (SELECT count(DISTINCT ud2.user_id) FROM public.user_devices ud2 WHERE ud2.device_id = ud.device_id) AS linked_account_count
    FROM public.user_devices ud
    LEFT JOIN public.user_profiles up ON up.id = ud.user_id
    ORDER BY linked_account_count DESC, ud.last_seen DESC
    LIMIT 500
  ) d;

  RETURN v_result;
END; $$;

-- ------------------------------------------------------------
-- Admin: delete one device row (e.g. clearing a false-positive
-- fraud match, or the record tied to a device a user no longer
-- owns). Regular users cannot call this — enforced in-function.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_device(p_device_row_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.user_devices WHERE id = p_device_row_id;
  RETURN jsonb_build_object('success', true);
END; $$;

-- Retire the old client-callable register_device RPC. Device writes now
-- happen only inside the register-device edge function using the
-- service role key, so a client can no longer self-report an arbitrary
-- device_id string (which was trivially spoofable via localStorage).
DROP FUNCTION IF EXISTS public.register_device(uuid, text);

-- ------------------------------------------------------------
-- Monetag is advertising, not an earn-tasks provider (spec #23) —
-- move it out of the 'tasks' category so it no longer shows up
-- as if it were another offerwall in the Offers/Surveys/Content
-- tab bar.
-- ------------------------------------------------------------
UPDATE public.task_provider_config SET category = 'advertising' WHERE provider_id = 'monetag';

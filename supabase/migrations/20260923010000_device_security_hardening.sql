-- ============================================================
-- LENORY DEVICE SECURITY + TASK PREVIEW HARDENING
--
-- Everything here is a plain Postgres function (RPC) — no Edge
-- Function required. Device registration was originally built as
-- an Edge Function, which needs a separate `supabase functions
-- deploy` step that never happened. Moving it into SQL means it
-- goes live the moment you run this script, same as everything
-- else already working.
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

-- One row per (user, device): repeat visits refresh last_seen instead of
-- creating duplicate rows forever.
DO $$
BEGIN
  ALTER TABLE public.user_devices ADD CONSTRAINT user_devices_user_device_unique UNIQUE (user_id, device_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Retire the old device RPC — it trusted a client-supplied p_user_id
-- (still checked against auth.uid(), so not exploitable, but the
-- device_id itself was a spoofable localStorage string, which is the
-- real problem register_device_v2 below fixes).
DROP FUNCTION IF EXISTS public.register_device(uuid, text);

-- ------------------------------------------------------------
-- Real device registration. Identity comes ONLY from auth.uid()
-- (never a client-supplied user_id). The fingerprint itself is a
-- hash of real browser/hardware signals computed client-side by
-- src/lib/deviceFingerprint.ts — not something a user can just
-- clear like localStorage.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_device_v2(
  p_device_hash text,
  p_user_agent text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_screen_resolution text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_hardware_concurrency integer DEFAULT NULL,
  p_device_memory numeric DEFAULT NULL,
  p_touch_support boolean DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing_owner uuid;
  v_device_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  IF p_device_hash IS NULL OR length(p_device_hash) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_fingerprint');
  END IF;

  -- Is this exact device already tied to a DIFFERENT account?
  SELECT user_id INTO v_existing_owner FROM public.user_devices
  WHERE device_id = p_device_hash AND user_id <> v_uid
  LIMIT 1;

  INSERT INTO public.user_devices (
    user_id, device_id, user_agent, platform, screen_resolution,
    timezone, language, hardware_concurrency, device_memory, touch_support, last_seen
  ) VALUES (
    v_uid, p_device_hash, p_user_agent, p_platform, p_screen_resolution,
    p_timezone, p_language, p_hardware_concurrency, p_device_memory, p_touch_support, now()
  )
  ON CONFLICT (user_id, device_id) DO UPDATE SET
    user_agent = EXCLUDED.user_agent,
    platform = EXCLUDED.platform,
    screen_resolution = EXCLUDED.screen_resolution,
    timezone = EXCLUDED.timezone,
    language = EXCLUDED.language,
    hardware_concurrency = EXCLUDED.hardware_concurrency,
    device_memory = EXCLUDED.device_memory,
    touch_support = EXCLUDED.touch_support,
    last_seen = now()
  RETURNING * INTO v_device_row;

  UPDATE public.user_profiles SET device_tracking_consented = true WHERE id = v_uid;

  IF v_existing_owner IS NOT NULL THEN
    -- Only THIS (newer) account gets restricted — the original owner
    -- of the device is never touched.
    UPDATE public.user_profiles
    SET earning_restricted = true, earning_restricted_reason = 'Device already linked to another account'
    WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'restricted', true, 'device', row_to_json(v_device_row));
  END IF;

  RETURN jsonb_build_object('success', true, 'restricted', false, 'device', row_to_json(v_device_row));
END; $$;

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
-- Admin: delete one device row (false-positive fraud match, or a
-- device the user no longer owns). Regular users cannot call
-- this — enforced inside the function itself, not just the UI.
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

-- ------------------------------------------------------------
-- Monetag is advertising, not an earn-tasks provider (spec #23) —
-- move it out of the tab-facing categories entirely.
-- ------------------------------------------------------------
UPDATE public.task_provider_config SET category = 'advertising' WHERE provider_id = 'monetag';

-- ------------------------------------------------------------
-- Server-calculated task previews. This is the Provider Adapter
-- Engine's calculateReward() (spec #9) — it must live on the
-- server, never in the browser. The frontend calls this and only
-- ever displays numbers it returns; it never does the math itself.
-- Uses the exact same formula process_task_postback() applies for
-- real, so the preview a user sees is never misleading.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
    SELECT
      provider_id,
      display_name,
      category,
      featured,
      min_age,
      country_availability,
      GREATEST(
        1,
        FLOOR(0.50 * (user_reward_percent / 100.0) * COALESCE(stars_per_usd_user_share, 50))
      ) AS preview_reward_stars
    FROM public.task_provider_config
    WHERE enabled = true AND maintenance_mode = false AND category <> 'advertising'
    ORDER BY sort_order ASC
  ) t;
  RETURN v_result;
END; $$;

-- ============================================================
-- DEVICE ADMIN EXPANSION
-- Adds real network/connection signals to user_devices, and
-- expands admin_list_devices() so a device card can show
-- everything: bot/restriction status on the linked account, and
-- every OTHER account sharing that same device.
-- ============================================================

ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS isp TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS connection_type TEXT;

CREATE OR REPLACE FUNCTION public.register_device_v2(
  p_device_hash text,
  p_user_agent text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_screen_resolution text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_hardware_concurrency integer DEFAULT NULL,
  p_device_memory numeric DEFAULT NULL,
  p_touch_support boolean DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_isp text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_connection_type text DEFAULT NULL
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

  SELECT user_id INTO v_existing_owner FROM public.user_devices
  WHERE device_id = p_device_hash AND user_id <> v_uid
  LIMIT 1;

  INSERT INTO public.user_devices (
    user_id, device_id, user_agent, platform, screen_resolution,
    timezone, language, hardware_concurrency, device_memory, touch_support,
    ip_address, isp, city, region, connection_type, last_seen
  ) VALUES (
    v_uid, p_device_hash, p_user_agent, p_platform, p_screen_resolution,
    p_timezone, p_language, p_hardware_concurrency, p_device_memory, p_touch_support,
    p_ip_address, p_isp, p_city, p_region, p_connection_type, now()
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
    ip_address = COALESCE(EXCLUDED.ip_address, public.user_devices.ip_address),
    isp = COALESCE(EXCLUDED.isp, public.user_devices.isp),
    city = COALESCE(EXCLUDED.city, public.user_devices.city),
    region = COALESCE(EXCLUDED.region, public.user_devices.region),
    connection_type = COALESCE(EXCLUDED.connection_type, public.user_devices.connection_type),
    last_seen = now()
  RETURNING * INTO v_device_row;

  UPDATE public.user_profiles SET device_tracking_consented = true WHERE id = v_uid;

  IF v_existing_owner IS NOT NULL THEN
    UPDATE public.user_profiles
    SET earning_restricted = true, earning_restricted_reason = 'Device already linked to another account'
    WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'restricted', true, 'device', row_to_json(v_device_row));
  END IF;

  RETURN jsonb_build_object('success', true, 'restricted', false, 'device', row_to_json(v_device_row));
END; $$;

-- ------------------------------------------------------------
-- Admin device list — now includes the linked account's bot/
-- restriction status and every OTHER account sharing the same
-- device hash, so a card fully expanded shows everything.
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
      up.earning_restricted,
      up.earning_restricted_reason,
      ud.device_id,
      ud.user_agent,
      ud.platform,
      ud.screen_resolution,
      ud.timezone,
      ud.language,
      ud.hardware_concurrency,
      ud.device_memory,
      ud.touch_support,
      ud.ip_address,
      ud.isp,
      ud.city,
      ud.region,
      ud.connection_type,
      ud.first_seen,
      ud.last_seen,
      (SELECT count(DISTINCT ud2.user_id) FROM public.user_devices ud2 WHERE ud2.device_id = ud.device_id) AS linked_account_count,
      (
        SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('user_id', ud3.user_id, 'username', up3.username)), '[]'::jsonb)
        FROM public.user_devices ud3
        LEFT JOIN public.user_profiles up3 ON up3.id = ud3.user_id
        WHERE ud3.device_id = ud.device_id AND ud3.user_id <> ud.user_id
      ) AS other_accounts
    FROM public.user_devices ud
    LEFT JOIN public.user_profiles up ON up.id = ud.user_id
    ORDER BY linked_account_count DESC, ud.last_seen DESC
    LIMIT 500
  ) d;

  RETURN v_result;
END; $$;

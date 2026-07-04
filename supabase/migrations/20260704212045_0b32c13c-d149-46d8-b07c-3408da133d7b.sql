
-- Admin RPC: set monetization level (0-3)
CREATE OR REPLACE FUNCTION public.admin_set_monetization_level(p_user_id uuid, p_level smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  IF p_level NOT IN (0,1,2,3) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_level');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', '1', true);
  UPDATE public.user_profiles SET monetization_level = p_level, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.admin_notifications(type, user_email, message)
  VALUES ('monetization_override', COALESCE((SELECT email FROM public.user_profiles WHERE id = p_user_id), ''),
          format('Level set to %s by admin', p_level));
  RETURN jsonb_build_object('success', true, 'level', p_level);
END;
$$;

-- Admin RPC: ban/unban earnings
CREATE OR REPLACE FUNCTION public.admin_set_earning_ban(p_user_id uuid, p_banned boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', '1', true);
  UPDATE public.user_profiles SET earning_banned = p_banned, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.admin_notifications(type, user_email, message)
  VALUES ('earning_ban', COALESCE((SELECT email FROM public.user_profiles WHERE id = p_user_id), ''),
          format('Earning %s. Reason: %s', CASE WHEN p_banned THEN 'BANNED' ELSE 'UNBANNED' END, COALESCE(p_reason,'—')));
  RETURN jsonb_build_object('success', true, 'banned', p_banned);
END;
$$;

-- Admin RPC: update an admin_settings value
CREATE OR REPLACE FUNCTION public.admin_update_setting(p_key text, p_value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  INSERT INTO public.admin_settings(setting_key, setting_value, setting_type)
  VALUES (p_key, p_value, 'string')
  ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Fraud review queue
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flag_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.fraud_flags TO authenticated;
GRANT ALL ON public.fraud_flags TO service_role;

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_flags_admin_all" ON public.fraud_flags;
CREATE POLICY "fraud_flags_admin_all" ON public.fraud_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS fraud_flags_user_idx ON public.fraud_flags(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_flags_status_idx ON public.fraud_flags(status, created_at DESC);

-- Velocity check trigger: flag if a viewer records > 40 first_views in 10 minutes
CREATE OR REPLACE FUNCTION public.check_view_velocity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF NEW.event_type = 'first_view' AND NEW.viewer_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.monetization_events
     WHERE viewer_id = NEW.viewer_id AND event_type = 'first_view' AND created_at > now() - interval '10 minutes';
    IF v_count > 40 THEN
      INSERT INTO public.fraud_flags(user_id, flag_type, severity, details)
      VALUES (NEW.viewer_id, 'view_velocity', 'high', jsonb_build_object('count_10m', v_count));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_view_velocity ON public.monetization_events;
CREATE TRIGGER trg_check_view_velocity
AFTER INSERT ON public.monetization_events
FOR EACH ROW EXECUTE FUNCTION public.check_view_velocity();

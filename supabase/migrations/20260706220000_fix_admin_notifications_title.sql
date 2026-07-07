-- Fix: admin_notifications.title is NOT NULL but was never being populated,
-- causing "null value in column 'title'" whenever an admin changed a
-- creator's monetization level or earning-ban status.

CREATE OR REPLACE FUNCTION public.admin_set_monetization_level(p_user_id uuid, p_level smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_username text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  IF p_level NOT IN (0,1,2,3) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_level');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', '1', true);
  UPDATE public.user_profiles SET monetization_level = p_level, updated_at = now() WHERE id = p_user_id;
  SELECT username INTO v_username FROM public.user_profiles WHERE id = p_user_id;
  INSERT INTO public.admin_notifications(type, title, user_email, message)
  VALUES ('monetization_override',
          format('Monetization level changed for @%s', COALESCE(v_username, p_user_id::text)),
          COALESCE(v_username, p_user_id::text),
          format('Level set to %s by admin', p_level));
  RETURN jsonb_build_object('success', true, 'level', p_level);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_earning_ban(p_user_id uuid, p_banned boolean, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_username text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', '1', true);
  UPDATE public.user_profiles SET earning_banned = p_banned, updated_at = now() WHERE id = p_user_id;
  SELECT username INTO v_username FROM public.user_profiles WHERE id = p_user_id;
  INSERT INTO public.admin_notifications(type, title, user_email, message)
  VALUES ('earning_ban',
          format('Earning %s for @%s', CASE WHEN p_banned THEN 'banned' ELSE 'unbanned' END, COALESCE(v_username, p_user_id::text)),
          COALESCE(v_username, p_user_id::text),
          format('Earning %s. Reason: %s', CASE WHEN p_banned THEN 'BANNED' ELSE 'UNBANNED' END, COALESCE(p_reason,'—')));
  RETURN jsonb_build_object('success', true, 'banned', p_banned);
END; $$;

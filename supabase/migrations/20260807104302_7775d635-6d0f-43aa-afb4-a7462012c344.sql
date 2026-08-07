
-- 1) chat_preferences extras
ALTER TABLE public.chat_preferences
  ADD COLUMN IF NOT EXISTS restricted_until timestamptz,
  ADD COLUMN IF NOT EXISTS theme_updated_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS chat_preferences_user_partner_key
  ON public.chat_preferences(user_id, partner_id);

-- 2) private_messages extras
ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS private_messages_expires_idx ON public.private_messages(expires_at);

-- 3) block helper
CREATE OR REPLACE FUNCTION public.is_chat_blocked(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

-- 4) enforce block + apply disappearing timer on insert
CREATE OR REPLACE FUNCTION public.enforce_private_message_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dur text; v_secs int := 0;
BEGIN
  IF NOT NEW.is_system AND public.is_chat_blocked(NEW.from_user_id, NEW.to_user_id) THEN
    RAISE EXCEPTION 'BLOCKED: you cannot message this account';
  END IF;

  SELECT disappearing_duration INTO v_dur
  FROM public.chat_preferences
  WHERE (user_id = NEW.from_user_id AND partner_id = NEW.to_user_id)
     OR (user_id = NEW.to_user_id AND partner_id = NEW.from_user_id)
  ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  v_secs := CASE v_dur
    WHEN '5m' THEN 300 WHEN '1h' THEN 3600 WHEN '6h' THEN 21600
    WHEN '24h' THEN 86400 WHEN '7d' THEN 604800 ELSE 0 END;

  IF v_secs > 0 AND NEW.expires_at IS NULL THEN
    NEW.expires_at := now() + make_interval(secs => v_secs);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_private_message_rules ON public.private_messages;
CREATE TRIGGER trg_enforce_private_message_rules
BEFORE INSERT ON public.private_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_private_message_rules();

-- 5) shared theme + shared disappearing mode (applies to both sides)
CREATE OR REPLACE FUNCTION public.set_shared_chat_pref(p_partner_id uuid, p_theme text DEFAULT NULL, p_disappearing text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.chat_preferences (user_id, partner_id, theme_key, disappearing_duration, theme_updated_by, updated_at)
  VALUES (v_me, p_partner_id, COALESCE(p_theme,'Default'), COALESCE(p_disappearing,'off'), v_me, now())
  ON CONFLICT (user_id, partner_id) DO UPDATE SET
    theme_key = COALESCE(p_theme, public.chat_preferences.theme_key),
    disappearing_duration = COALESCE(p_disappearing, public.chat_preferences.disappearing_duration),
    theme_updated_by = v_me, updated_at = now();

  INSERT INTO public.chat_preferences (user_id, partner_id, theme_key, disappearing_duration, theme_updated_by, updated_at)
  VALUES (p_partner_id, v_me, COALESCE(p_theme,'Default'), COALESCE(p_disappearing,'off'), v_me, now())
  ON CONFLICT (user_id, partner_id) DO UPDATE SET
    theme_key = COALESCE(p_theme, public.chat_preferences.theme_key),
    disappearing_duration = COALESCE(p_disappearing, public.chat_preferences.disappearing_duration),
    theme_updated_by = v_me, updated_at = now();

  RETURN jsonb_build_object('success', true);
END; $$;

-- 6) restrict for 14 days
CREATE OR REPLACE FUNCTION public.restrict_chat(p_partner_id uuid, p_days int DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.chat_preferences (user_id, partner_id, is_restricted, restricted_until, updated_at)
  VALUES (v_me, p_partner_id, true, now() + make_interval(days => p_days), now())
  ON CONFLICT (user_id, partner_id) DO UPDATE SET
    is_restricted = true, restricted_until = now() + make_interval(days => p_days), updated_at = now();
  RETURN jsonb_build_object('success', true, 'until', now() + make_interval(days => p_days));
END; $$;

-- 7) chat reports
CREATE TABLE IF NOT EXISTS public.chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.chat_reports TO authenticated;
GRANT ALL ON public.chat_reports TO service_role;

ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users create own chat reports" ON public.chat_reports;
CREATE POLICY "Users create own chat reports" ON public.chat_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users read own chat reports" ON public.chat_reports;
CREATE POLICY "Users read own chat reports" ON public.chat_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage chat reports" ON public.chat_reports;
CREATE POLICY "Admins manage chat reports" ON public.chat_reports
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_chat_reports_updated ON public.chat_reports;
CREATE TRIGGER trg_chat_reports_updated BEFORE UPDATE ON public.chat_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8) report a chat with full transcript snapshot
CREATE OR REPLACE FUNCTION public.report_chat(p_partner_id uuid, p_reason text, p_details text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_tx jsonb; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at), '[]'::jsonb) INTO v_tx
  FROM (
    SELECT id, from_user_id, to_user_id, message, media_url, created_at
    FROM public.private_messages
    WHERE (from_user_id = v_me AND to_user_id = p_partner_id)
       OR (from_user_id = p_partner_id AND to_user_id = v_me)
    ORDER BY created_at
  ) t;

  INSERT INTO public.chat_reports (reporter_id, reported_id, reason, details, transcript)
  VALUES (v_me, p_partner_id, p_reason, p_details, v_tx)
  RETURNING id INTO v_id;

  INSERT INTO public.admin_notifications (type, title, user_email, message)
  VALUES ('chat_report', 'New chat report', v_me::text, COALESCE(p_reason,'Chat reported'));

  RETURN jsonb_build_object('success', true, 'id', v_id);
END; $$;

-- 9) purge expired disappearing messages
CREATE OR REPLACE FUNCTION public.purge_expired_private_messages()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.private_messages SET is_deleted = true
  WHERE expires_at IS NOT NULL AND expires_at < now() AND is_deleted = false;
$$;

GRANT EXECUTE ON FUNCTION public.set_shared_chat_pref(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restrict_chat(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_chat(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_private_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_blocked(uuid, uuid) TO authenticated;

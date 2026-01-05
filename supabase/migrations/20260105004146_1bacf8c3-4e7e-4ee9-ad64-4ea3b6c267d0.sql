-- Fix migration: pg_policies column is policyname (not polname)

-- 1) Fix SECURITY DEFINER functions search_path (best-effort)
DO $$
BEGIN
  BEGIN ALTER FUNCTION public.handle_new_user() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_follower_counts() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.track_search(text) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_post_count() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_post_status() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_reaction_count() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.notify_story_reaction() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.notify_withdrawal_status_change() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.process_story_view(text, uuid) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.process_post_view(text, uuid) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.process_paid_view(text, text, uuid, uuid, integer) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.deduct_voice_credits(uuid) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.use_voice_credit(uuid) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.use_ai_credit(uuid) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.archive_old_posts() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.auto_archive_old_posts() SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.join_group_with_fee(text, uuid, integer) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.admin_set_user_balances(uuid, integer, numeric, text) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.admin_update_payment_request(uuid, text, text) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.admin_send_broadcast(text, text, text) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.execute_admin_sql(text) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.has_role(uuid, public.app_role) SET search_path = public; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

-- Helper: drop all policies on a table
CREATE OR REPLACE FUNCTION public._drop_all_policies(_schema text, _table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = _schema AND tablename = _table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, _schema, _table);
  END LOOP;
END;
$$;

-- 2) RLS policies

-- user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','user_profiles');
CREATE POLICY "profiles_select_authenticated" ON public.user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_insert_own" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.user_profiles FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- user_balances
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','user_balances');
CREATE POLICY "balances_select_own" ON public.user_balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "balances_update_own" ON public.user_balances FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "balances_insert_own" ON public.user_balances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "balances_admin_all" ON public.user_balances FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- payment_requests
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','payment_requests');
CREATE POLICY "payment_requests_select_own" ON public.payment_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payment_requests_insert_own" ON public.payment_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payment_requests_admin_all" ON public.payment_requests FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- user_notifications
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','user_notifications');
CREATE POLICY "notifications_select_own" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_insert_own" ON public.user_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notifications_admin_all" ON public.user_notifications FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','admin_settings');
CREATE POLICY "admin_settings_select_authenticated" ON public.admin_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_settings_admin_all" ON public.admin_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- star_packages
ALTER TABLE public.star_packages ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','star_packages');
CREATE POLICY "star_packages_select_enabled_authenticated" ON public.star_packages FOR SELECT USING (auth.uid() IS NOT NULL AND COALESCE(status,'enabled') = 'enabled');
CREATE POLICY "star_packages_admin_all" ON public.star_packages FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- general_messages
ALTER TABLE public.general_messages ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','general_messages');
CREATE POLICY "general_messages_select_authenticated" ON public.general_messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "general_messages_admin_all" ON public.general_messages FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- private_messages
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','private_messages');
CREATE POLICY "pm_select_own" ON public.private_messages FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "pm_insert_sender" ON public.private_messages FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "pm_update_receiver_read" ON public.private_messages FOR UPDATE USING (auth.uid() = to_user_id) WITH CHECK (auth.uid() = to_user_id);
CREATE POLICY "pm_delete_sender" ON public.private_messages FOR DELETE USING (auth.uid() = from_user_id);
CREATE POLICY "pm_admin_all" ON public.private_messages FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- admin_private_messages
ALTER TABLE public.admin_private_messages ENABLE ROW LEVEL SECURITY;
SELECT public._drop_all_policies('public','admin_private_messages');
CREATE POLICY "apm_select_user" ON public.admin_private_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "apm_insert_user" ON public.admin_private_messages FOR INSERT WITH CHECK (auth.uid() = user_id AND COALESCE(is_from_admin,false) = false);
CREATE POLICY "apm_admin_all" ON public.admin_private_messages FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Realtime
DO $$
BEGIN
  ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
  ALTER TABLE public.payment_requests REPLICA IDENTITY FULL;
  ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
  ALTER TABLE public.private_messages REPLICA IDENTITY FULL;
  ALTER TABLE public.admin_private_messages REPLICA IDENTITY FULL;
  ALTER TABLE public.admin_settings REPLICA IDENTITY FULL;
  ALTER TABLE public.star_packages REPLICA IDENTITY FULL;
  ALTER TABLE public.general_messages REPLICA IDENTITY FULL;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.user_notifications',
    'public.payment_requests',
    'public.user_profiles',
    'public.private_messages',
    'public.admin_private_messages',
    'public.admin_settings',
    'public.star_packages',
    'public.general_messages',
    'public.posts',
    'public.user_storylines',
    'public.post_reports'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- cleanup helper
DROP FUNCTION IF EXISTS public._drop_all_policies(text, text);

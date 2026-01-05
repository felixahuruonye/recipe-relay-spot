-- Tighten admin_private_messages RLS (remove accidental public access)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='admin_private_messages' AND policyname='Allow admin access to private messages'
  ) THEN
    EXECUTE 'DROP POLICY "Allow admin access to private messages" ON public.admin_private_messages';
  END IF;
END $$;

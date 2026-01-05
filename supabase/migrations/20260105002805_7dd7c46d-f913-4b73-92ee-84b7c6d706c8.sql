-- Admin RLS policies so the Admin panel can actually control the app

-- user_profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_profiles' AND policyname='Admins can manage all user profiles'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage all user profiles" ON public.user_profiles';
  END IF;
END $$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all user profiles"
ON public.user_profiles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- posts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='posts' AND policyname='Admins can manage all posts'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage all posts" ON public.posts';
  END IF;
END $$;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all posts"
ON public.posts
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- user_storylines
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_storylines' AND policyname='Admins can manage all storylines'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage all storylines" ON public.user_storylines';
  END IF;
END $$;

ALTER TABLE public.user_storylines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all storylines"
ON public.user_storylines
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- tasks
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tasks' AND policyname='Admins can manage all tasks'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage all tasks" ON public.tasks';
  END IF;
END $$;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all tasks"
ON public.tasks
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- post_reports (admins already have authenticated policies, but allow full admin control)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='post_reports' AND policyname='Admins can manage all post reports'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can manage all post reports" ON public.post_reports';
  END IF;
END $$;

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all post reports"
ON public.post_reports
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

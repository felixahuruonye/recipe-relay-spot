-- Allow everyone to read share counts (needed for feed side icons)
ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'post_shares' AND policyname = 'Anyone can read post_shares'
  ) THEN
    CREATE POLICY "Anyone can read post_shares"
      ON public.post_shares FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'post_shares' AND policyname = 'Users can insert own post_shares'
  ) THEN
    CREATE POLICY "Users can insert own post_shares"
      ON public.post_shares FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Allow reading bookmark counts for feed (item_id only is fine)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_bookmarks' AND policyname = 'Anyone can read bookmark rows'
  ) THEN
    CREATE POLICY "Anyone can read bookmark rows"
      ON public.user_bookmarks FOR SELECT
      USING (true);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Privacy flag on posts (idempotent)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_is_private ON public.posts(is_private);
CREATE INDEX IF NOT EXISTS idx_posts_user_private ON public.posts(user_id, is_private);

-- If an earlier version of this migration already created user_bookmarks
-- with a posts-only (post_id) shape, drop it and recreate with the
-- generic (item_type, item_id) shape so it also supports products.
-- The feature was never functional before this migration, so there is
-- no real bookmark data to preserve.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_bookmarks' AND column_name = 'post_id'
  ) THEN
    DROP TABLE public.user_bookmarks;
  END IF;
END $$;

-- Generic bookmarks table: supports both posts and marketplace products.
-- posts.id and products.id are both TEXT, so we use a polymorphic
-- (item_type, item_id) pair instead of two separate FK columns.
CREATE TABLE IF NOT EXISTS public.user_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('post', 'product')),
  item_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(item_type, item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON public.user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_item ON public.user_bookmarks(item_type, item_id);

ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.user_bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.user_bookmarks
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can add bookmarks" ON public.user_bookmarks;
CREATE POLICY "Users can add bookmarks" ON public.user_bookmarks
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can remove their own bookmarks" ON public.user_bookmarks;
CREATE POLICY "Users can remove their own bookmarks" ON public.user_bookmarks
  FOR DELETE USING (user_id = auth.uid());

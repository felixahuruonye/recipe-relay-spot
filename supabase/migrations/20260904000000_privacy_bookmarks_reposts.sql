-- Add privacy, repost and pinned flags to posts (idempotent)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_repost BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_story BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_is_private ON public.posts(is_private);
CREATE INDEX IF NOT EXISTS idx_posts_is_repost ON public.posts(is_repost);
CREATE INDEX IF NOT EXISTS idx_posts_user_private ON public.posts(user_id, is_private);
CREATE INDEX IF NOT EXISTS idx_posts_user_repost ON public.posts(user_id, is_repost);

-- Create user_bookmarks table (note: posts.id is TEXT, not UUID)
CREATE TABLE IF NOT EXISTS public.user_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON public.user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_post ON public.user_bookmarks(post_id);

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

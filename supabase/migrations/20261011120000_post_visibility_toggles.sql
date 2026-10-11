-- Per-post visibility controls for comments and view counts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS views_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.posts.comments_enabled IS 'When false, comment icon is hidden on the feed for this post';
COMMENT ON COLUMN public.posts.views_visible IS 'When false, view (eye) count is hidden on the feed for this post';

ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.comment_replies ADD COLUMN IF NOT EXISTS image_url text;
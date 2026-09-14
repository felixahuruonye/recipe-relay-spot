-- Tracks who ORIGINALLY posted a story, separate from who posted this
-- particular row (which matters once a story can be reshared - the
-- reshared copy's user_id is the resharer, but original_creator_id keeps
-- pointing at whoever first posted it, so "Story By @username" always
-- credits the right person even through multiple reshares).
ALTER TABLE public.user_storylines ADD COLUMN IF NOT EXISTS original_creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Every story that already existed before this column was added is, by
-- definition, an original post (reposting didn't exist yet) - backfill
-- so every row, old and new, has a valid attribution target rather than
-- relying on every single read-site to fall back to user_id itself.
UPDATE public.user_storylines
SET original_creator_id = user_id
WHERE original_creator_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_storylines_original_creator ON public.user_storylines(original_creator_id);

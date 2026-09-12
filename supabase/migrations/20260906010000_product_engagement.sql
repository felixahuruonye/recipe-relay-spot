-- ============================================================
-- Product engagement: likes + cascade cleanup on delete
-- (product_reviews already exists and is reused as the "comment" count;
--  user_bookmarks already exists from an earlier migration and is reused
--  for the bookmark count)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_likes_product ON public.product_likes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_likes_user ON public.product_likes(user_id);

ALTER TABLE public.product_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view product likes" ON public.product_likes;
CREATE POLICY "Anyone can view product likes" ON public.product_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like products" ON public.product_likes;
CREATE POLICY "Users can like products" ON public.product_likes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unlike their own product likes" ON public.product_likes;
CREATE POLICY "Users can unlike their own product likes" ON public.product_likes
  FOR DELETE USING (user_id = auth.uid());

-- product_reviews.product_id had no foreign key at all before this, so
-- deleting a product left its reviews orphaned rather than deleted.
-- Retrofitting a real FK with ON DELETE CASCADE. Any already-orphaned
-- reviews (product no longer exists) are cleaned up first so the FK can
-- actually be added.
DELETE FROM public.product_reviews pr
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pr.product_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'product_reviews_product_id_fkey'
  ) THEN
    ALTER TABLE public.product_reviews
      ADD CONSTRAINT product_reviews_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- user_bookmarks is polymorphic (item_type/item_id can point at either
-- posts or products), so it can't carry a normal foreign key to
-- products directly. A trigger does the equivalent cleanup instead.
CREATE OR REPLACE FUNCTION public.cleanup_product_bookmarks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM user_bookmarks WHERE item_type = 'product' AND item_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_product_bookmarks ON public.products;
CREATE TRIGGER trg_cleanup_product_bookmarks
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_product_bookmarks();

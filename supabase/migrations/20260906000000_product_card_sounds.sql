-- Background music that plays automatically on Marketplace product cards
-- in the feed, alternating track-per-card the same way TikTok attaches a
-- sound to a video. The audio files themselves are served from this app's
-- own /public/sounds (Vercel CDN) - this table is the data-driven layer on
-- top, so which files are used/their order can be changed here later
-- without a code deploy.
CREATE TABLE IF NOT EXISTS public.product_card_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_card_sounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active product card sounds" ON public.product_card_sounds;
CREATE POLICY "Anyone can view active product card sounds" ON public.product_card_sounds
  FOR SELECT USING (active = true);

INSERT INTO public.product_card_sounds (title, url, sort_order)
VALUES
  ('Product Card Sound 1', '/sounds/product-bg-1.mp3', 0),
  ('Product Card Sound 2', '/sounds/product-bg-2.mp3', 1)
ON CONFLICT DO NOTHING;

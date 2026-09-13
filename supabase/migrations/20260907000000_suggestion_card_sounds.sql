-- Background music for the people-suggestion carousel cards, same
-- pattern as product_card_sounds: files live in /public/sounds (Vercel
-- CDN), this table is the data-driven layer so which tracks play and
-- their order can change later without a code deploy.
CREATE TABLE IF NOT EXISTS public.suggestion_card_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.suggestion_card_sounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active suggestion card sounds" ON public.suggestion_card_sounds;
CREATE POLICY "Anyone can view active suggestion card sounds" ON public.suggestion_card_sounds
  FOR SELECT USING (active = true);

INSERT INTO public.suggestion_card_sounds (title, url, sort_order)
VALUES
  ('Suggestion Card Sound 1', '/sounds/suggestion-bg-1.mp3', 0),
  ('Suggestion Card Sound 2', '/sounds/suggestion-bg-2.mp3', 1),
  ('Suggestion Card Sound 3', '/sounds/suggestion-bg-3.mp3', 2),
  ('Suggestion Card Sound 4', '/sounds/suggestion-bg-4.mp3', 3),
  ('Suggestion Card Sound 5', '/sounds/suggestion-bg-5.mp3', 4)
ON CONFLICT DO NOTHING;

-- Create star_rates table for SM Live Star Rates
CREATE TABLE IF NOT EXISTS public.star_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stars INTEGER NOT NULL,
  price_naira NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create star_market table for Star packages
CREATE TABLE IF NOT EXISTS public.star_market (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stars INTEGER NOT NULL,
  price_naira NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  purchase_url TEXT,
  note TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create search_trends table for tracking searches
CREATE TABLE IF NOT EXISTS public.search_trends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  search_count INTEGER DEFAULT 1,
  last_search_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add ai_credits column to user_profiles if not exists
DO $$ BEGIN
  ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS ai_credits INTEGER DEFAULT 250;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Add star_price to posts table
DO $$ BEGIN
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS star_price INTEGER DEFAULT 0;
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_type TEXT;
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS post_status TEXT DEFAULT 'new';
  ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS ad_attached BOOLEAN DEFAULT FALSE;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.star_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_market ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_trends ENABLE ROW LEVEL SECURITY;

-- RLS policies for star_rates
CREATE POLICY "Anyone can view star rates" ON public.star_rates
  FOR SELECT USING (true);

-- RLS policies for star_market
CREATE POLICY "Anyone can view star market" ON public.star_market
  FOR SELECT USING (true);

-- RLS policies for search_trends
CREATE POLICY "Anyone can view search trends" ON public.search_trends
  FOR SELECT USING (true);

CREATE POLICY "Users can insert search trends" ON public.search_trends
  FOR INSERT WITH CHECK (true);

-- Seed star_market with initial data
INSERT INTO public.star_market (stars, price_naira, price_usd, status) VALUES
(10, 5000, 3.33, 'active'),
(20, 10000, 6.67, 'active'),
(50, 25000, 16.67, 'active'),
(100, 50000, 33.33, 'active'),
(200, 100000, 66.67, 'active'),
(500, 250000, 166.67, 'active'),
(1000, 500000, 333.33, 'active'),
(2000, 1000000, 666.67, 'active'),
(5000, 2500000, 1666.67, 'active'),
(10000, 5000000, 3333.33, 'active')
ON CONFLICT DO NOTHING;

-- Function to track trending searches
CREATE OR REPLACE FUNCTION public.track_search(search_keyword TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.search_trends (keyword, search_count, last_search_at)
  VALUES (search_keyword, 1, NOW())
  ON CONFLICT (keyword) DO UPDATE
  SET search_count = search_trends.search_count + 1,
      last_search_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to move posts from new to viewed after 48 hours
CREATE OR REPLACE FUNCTION public.update_post_status()
RETURNS void AS $$
BEGIN
  UPDATE public.posts
  SET post_status = 'viewed'
  WHERE post_status = 'new'
  AND created_at < NOW() - INTERVAL '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
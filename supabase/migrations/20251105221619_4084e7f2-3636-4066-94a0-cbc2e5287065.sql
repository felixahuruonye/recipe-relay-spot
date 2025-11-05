-- Add missing columns to existing tables
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS ai_credits INTEGER DEFAULT 250,
  ADD COLUMN IF NOT EXISTS voice_credits INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS saved_searches JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS story_settings JSONB DEFAULT '{"show_to_everyone": true, "comments_enabled": true, "audience_control": false, "min_age": 13}'::jsonb;

-- Update groups table for entry fees
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS entry_fee_stars INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indexable BOOLEAN DEFAULT true;

-- Create star_rates table for marketplace
CREATE TABLE IF NOT EXISTS star_rates (
  id BIGSERIAL PRIMARY KEY,
  stars BIGINT NOT NULL,
  price_naira NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  status TEXT CHECK (status IN ('enabled','disabled')) DEFAULT 'enabled',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create star_market packages
CREATE TABLE IF NOT EXISTS star_market (
  id BIGSERIAL PRIMARY KEY,
  stars BIGINT NOT NULL,
  price_naira NUMERIC NOT NULL,
  price_usd NUMERIC NOT NULL,
  url TEXT,
  note TEXT,
  status TEXT CHECK (status IN ('enabled','disabled')) DEFAULT 'enabled',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create ads_table for AdSense integration
CREATE TABLE IF NOT EXISTS ads_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_type TEXT NOT NULL,
  ad_unit_id TEXT,
  media_url TEXT,
  code_snippet TEXT,
  status TEXT CHECK (status IN ('active','paused')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create ads_attachments for post ads
CREATE TABLE IF NOT EXISTS ads_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  ad_id UUID REFERENCES ads_table(id),
  attached_at TIMESTAMPTZ DEFAULT now(),
  revenue_generated NUMERIC DEFAULT 0
);

-- Create wallet_history for tracking transactions
CREATE TABLE IF NOT EXISTS wallet_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'NGN',
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create saved_searches table
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create hot_topics table for trending posts
CREATE TABLE IF NOT EXISTS hot_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  views_count INTEGER DEFAULT 0,
  reactions_count INTEGER DEFAULT 0,
  marked_at TIMESTAMPTZ DEFAULT now()
);

-- Update search_trends to support time windows
ALTER TABLE search_trends 
  ADD COLUMN IF NOT EXISTS search_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS hourly_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_count INTEGER DEFAULT 0;

-- Create function to track hot topics
CREATE OR REPLACE FUNCTION mark_hot_topic()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.view_count >= 100 OR (SELECT COUNT(*) FROM post_likes WHERE post_id = NEW.id) >= 100) THEN
    INSERT INTO hot_topics (post_id, views_count, reactions_count)
    VALUES (NEW.id, NEW.view_count, (SELECT COUNT(*) FROM post_likes WHERE post_id = NEW.id))
    ON CONFLICT (post_id) DO UPDATE 
    SET views_count = NEW.view_count, 
        reactions_count = (SELECT COUNT(*) FROM post_likes WHERE post_id = NEW.id),
        marked_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for hot topics
DROP TRIGGER IF EXISTS trigger_mark_hot_topic ON posts;
CREATE TRIGGER trigger_mark_hot_topic
  AFTER UPDATE OF view_count ON posts
  FOR EACH ROW
  EXECUTE FUNCTION mark_hot_topic();

-- Create function to handle VIP post rewards
CREATE OR REPLACE FUNCTION reward_vip_post()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT is_vip FROM user_profiles WHERE id = NEW.user_id) THEN
    UPDATE user_profiles 
    SET star_balance = star_balance + 5
    WHERE id = NEW.user_id;
    
    INSERT INTO user_notifications (user_id, title, message, type, notification_category)
    VALUES (NEW.user_id, 'VIP Reward! ⭐', 'You earned +5 Stars for your new post!', 'success', 'vip_reward');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for VIP rewards
DROP TRIGGER IF EXISTS trigger_reward_vip_post ON posts;
CREATE TRIGGER trigger_reward_vip_post
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION reward_vip_post();

-- Create function to handle voice search credit deduction
CREATE OR REPLACE FUNCTION deduct_voice_credits(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_voice_credits INTEGER;
  v_star_balance INTEGER;
BEGIN
  SELECT voice_credits, star_balance INTO v_voice_credits, v_star_balance
  FROM user_profiles WHERE id = p_user_id;
  
  IF v_voice_credits <= 0 THEN
    IF v_star_balance >= 300 THEN
      UPDATE user_profiles 
      SET star_balance = star_balance - 300, voice_credits = 50
      WHERE id = p_user_id;
      RETURN jsonb_build_object('success', true, 'recharged', true, 'credits', 50);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
    END IF;
  ELSE
    UPDATE user_profiles 
    SET voice_credits = voice_credits - 1
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'credits', v_voice_credits - 1);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed initial star rates
INSERT INTO star_rates (stars, price_naira, price_usd) VALUES
  (10, 5000, 3.33),
  (20, 10000, 6.67),
  (50, 25000, 16.67),
  (100, 50000, 33.33),
  (200, 100000, 66.67),
  (500, 250000, 166.67),
  (1000, 500000, 333.33)
ON CONFLICT DO NOTHING;

-- Seed star market packages
INSERT INTO star_market (stars, price_naira, price_usd, note) VALUES
  (10, 5000, 3.33, 'Starter Pack'),
  (50, 25000, 16.67, 'Popular Choice'),
  (100, 50000, 33.33, 'Best Value'),
  (500, 250000, 166.67, 'Power User'),
  (1000, 500000, 333.33, 'VIP Pack')
ON CONFLICT DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE star_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE star_market ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_topics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Public can view star rates" ON star_rates FOR SELECT USING (status = 'enabled');
CREATE POLICY "Public can view star market" ON star_market FOR SELECT USING (status = 'enabled');
CREATE POLICY "Users can view their wallet history" ON wallet_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage saved searches" ON saved_searches FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Public can view hot topics" ON hot_topics FOR SELECT USING (true);
CREATE POLICY "Public can view ads" ON ads_table FOR SELECT USING (status = 'active');
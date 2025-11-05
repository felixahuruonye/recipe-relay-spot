-- Create view_transactions table for auditing star economy
CREATE TABLE IF NOT EXISTS view_transactions (
  id bigserial PRIMARY KEY,
  post_id text REFERENCES posts(id) ON DELETE CASCADE,
  story_id uuid REFERENCES user_storylines(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  star_price bigint NOT NULL,
  uploader_share numeric NOT NULL,
  viewer_share numeric NOT NULL,
  platform_share numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create stickers table
CREATE TABLE IF NOT EXISTS stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  image_url text NOT NULL,
  tags text[],
  star_price integer DEFAULT 0,
  usage_count integer DEFAULT 0,
  is_featured boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz DEFAULT now()
);

-- Create sticker_usage table
CREATE TABLE IF NOT EXISTS sticker_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid REFERENCES stickers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id uuid REFERENCES user_storylines(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Update groups table with missing columns
ALTER TABLE groups ADD COLUMN IF NOT EXISTS entry_fee_stars integer DEFAULT 0;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS indexable boolean DEFAULT true;

-- Update posts table with missing columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id text REFERENCES groups(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS uploader_id uuid REFERENCES auth.users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS star_price_paid integer DEFAULT 0;

-- Update user_profiles with wallet and credits
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS total_earned numeric DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ai_credits integer DEFAULT 250;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false;

-- Create function to process paid story/post view
CREATE OR REPLACE FUNCTION process_paid_view(
  p_content_id text,
  p_content_type text,
  p_viewer_id uuid,
  p_uploader_id uuid,
  p_star_price integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_viewer_balance integer;
  v_uploader_share numeric;
  v_viewer_share numeric;
  v_platform_share numeric;
  v_star_value numeric := 500;
BEGIN
  -- Check viewer's star balance
  SELECT star_balance INTO v_viewer_balance
  FROM user_profiles WHERE id = p_viewer_id;
  
  IF v_viewer_balance < p_star_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
  END IF;
  
  -- Calculate shares
  v_uploader_share := (p_star_price * v_star_value * 0.60);
  v_viewer_share := (p_star_price * v_star_value * 0.20);
  v_platform_share := (p_star_price * v_star_value * 0.20);
  
  -- Deduct stars from viewer
  UPDATE user_profiles
  SET star_balance = star_balance - p_star_price
  WHERE id = p_viewer_id;
  
  -- Credit uploader wallet
  UPDATE user_profiles
  SET wallet_balance = wallet_balance + v_uploader_share,
      total_earned = total_earned + v_uploader_share
  WHERE id = p_uploader_id;
  
  -- Credit viewer wallet (cashback)
  UPDATE user_profiles
  SET wallet_balance = wallet_balance + v_viewer_share
  WHERE id = p_viewer_id;
  
  -- Record transaction in wallet_history
  INSERT INTO wallet_history (user_id, type, amount, meta)
  VALUES 
    (p_uploader_id, 'upload_earn', v_uploader_share, jsonb_build_object('content_id', p_content_id, 'content_type', p_content_type)),
    (p_viewer_id, 'view_earn', v_viewer_share, jsonb_build_object('content_id', p_content_id, 'content_type', p_content_type));
  
  -- Record in view_transactions
  IF p_content_type = 'story' THEN
    INSERT INTO view_transactions (story_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
    VALUES (p_content_id::uuid, p_viewer_id, p_uploader_id, p_star_price, v_uploader_share, v_viewer_share, v_platform_share);
  ELSE
    INSERT INTO view_transactions (post_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
    VALUES (p_content_id, p_viewer_id, p_uploader_id, p_star_price, v_uploader_share, v_viewer_share, v_platform_share);
  END IF;
  
  -- Notify both parties
  INSERT INTO user_notifications (user_id, title, message, type, notification_category, action_data)
  VALUES 
    (p_uploader_id, 'Earnings! 💰', format('You earned ₦%s from your %s!', v_uploader_share, p_content_type), 'success', 'earnings', jsonb_build_object('amount', v_uploader_share)),
    (p_viewer_id, 'Cashback! 🎁', format('You earned ₦%s cashback!', v_viewer_share), 'success', 'cashback', jsonb_build_object('amount', v_viewer_share));
  
  RETURN jsonb_build_object(
    'success', true,
    'uploader_earned', v_uploader_share,
    'viewer_earned', v_viewer_share,
    'platform_earned', v_platform_share
  );
END;
$$;

-- Create function to handle group join with entry fee
CREATE OR REPLACE FUNCTION join_group_with_fee(
  p_group_id text,
  p_user_id uuid,
  p_entry_fee integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_balance integer;
  v_owner_id uuid;
  v_owner_share numeric;
  v_platform_share numeric;
  v_star_value numeric := 500;
BEGIN
  IF p_entry_fee > 0 THEN
    -- Check user's star balance
    SELECT star_balance INTO v_user_balance
    FROM user_profiles WHERE id = p_user_id;
    
    IF v_user_balance < p_entry_fee THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars');
    END IF;
    
    -- Get group owner
    SELECT owner_id INTO v_owner_id FROM groups WHERE id = p_group_id;
    
    -- Calculate shares (80% owner, 20% platform)
    v_owner_share := (p_entry_fee * v_star_value * 0.80);
    v_platform_share := (p_entry_fee * v_star_value * 0.20);
    
    -- Deduct stars from user
    UPDATE user_profiles
    SET star_balance = star_balance - p_entry_fee
    WHERE id = p_user_id;
    
    -- Credit owner wallet
    UPDATE user_profiles
    SET wallet_balance = wallet_balance + v_owner_share,
        total_earned = total_earned + v_owner_share
    WHERE id = v_owner_id;
    
    -- Record in wallet_history
    INSERT INTO wallet_history (user_id, type, amount, meta)
    VALUES 
      (v_owner_id, 'group_fee', v_owner_share, jsonb_build_object('group_id', p_group_id, 'member_id', p_user_id)),
      (p_user_id, 'group_join', -p_entry_fee * v_star_value, jsonb_build_object('group_id', p_group_id));
  END IF;
  
  -- Add user to group
  INSERT INTO group_members (group_id, user_id, status)
  VALUES (p_group_id, p_user_id, 'active');
  
  -- Update member count
  UPDATE groups SET member_count = member_count + 1 WHERE id = p_group_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Enable RLS on new tables
ALTER TABLE view_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for view_transactions
CREATE POLICY "Users can view their own transactions"
  ON view_transactions FOR SELECT
  USING (auth.uid() = viewer_id OR auth.uid() = uploader_id);

-- RLS policies for stickers
CREATE POLICY "Anyone can view active stickers"
  ON stickers FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can create stickers"
  ON stickers FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own stickers"
  ON stickers FOR UPDATE
  USING (auth.uid() = creator_id);

-- RLS policies for sticker_usage
CREATE POLICY "Users can view their sticker usage"
  ON sticker_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add sticker usage"
  ON sticker_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_view_transactions_viewer ON view_transactions(viewer_id);
CREATE INDEX IF NOT EXISTS idx_view_transactions_uploader ON view_transactions(uploader_id);
CREATE INDEX IF NOT EXISTS idx_stickers_featured ON stickers(is_featured) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_stickers_usage_count ON stickers(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_history_user ON wallet_history(user_id, created_at DESC);
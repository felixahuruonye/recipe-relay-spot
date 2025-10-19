-- Add preview and music to storylines
ALTER TABLE user_storylines 
ADD COLUMN IF NOT EXISTS preview_url TEXT,
ADD COLUMN IF NOT EXISTS music_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image';

-- Create storyline reactions table
CREATE TABLE IF NOT EXISTS storyline_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id UUID NOT NULL REFERENCES user_storylines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(storyline_id, user_id)
);

ALTER TABLE storyline_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can add storyline reactions" ON storyline_reactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their reactions" ON storyline_reactions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view all reactions" ON storyline_reactions
  FOR SELECT USING (true);

-- Create storyline comments table
CREATE TABLE IF NOT EXISTS storyline_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id UUID NOT NULL REFERENCES user_storylines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE storyline_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can add storyline comments" ON storyline_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view storyline comments" ON storyline_comments
  FOR SELECT USING (true);

-- Create group messages table
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can send messages" ON group_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members 
      WHERE group_id = group_messages.group_id 
      AND user_id = auth.uid() 
      AND status = 'active'
    )
  );

CREATE POLICY "Group members can view messages" ON group_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members 
      WHERE group_id = group_messages.group_id 
      AND user_id = auth.uid() 
      AND status = 'active'
    )
  );

-- Create products table for marketplace
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price_ngn NUMERIC NOT NULL,
  stock INTEGER NOT NULL DEFAULT 1,
  delivery_options TEXT,
  seller_contact TEXT,
  images TEXT[] DEFAULT '{}',
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view products" ON products
  FOR SELECT USING (true);

CREATE POLICY "VIP users can create products" ON products
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND vip = true
    )
  );

CREATE POLICY "Sellers can update their products" ON products
  FOR UPDATE USING (seller_user_id = auth.uid());

CREATE POLICY "Sellers can delete their products" ON products
  FOR DELETE USING (seller_user_id = auth.uid());

-- Add star_balance to user_profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'user_profiles' 
                 AND column_name = 'star_balance') THEN
    ALTER TABLE user_profiles ADD COLUMN star_balance NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE storyline_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE storyline_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
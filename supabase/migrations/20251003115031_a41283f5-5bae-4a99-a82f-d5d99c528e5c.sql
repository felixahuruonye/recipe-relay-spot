-- Create followers table
CREATE TABLE IF NOT EXISTS public.followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can follow others"
  ON public.followers FOR INSERT
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "Users can unfollow"
  ON public.followers FOR DELETE
  USING (follower_id = auth.uid());

CREATE POLICY "Anyone can view followers"
  ON public.followers FOR SELECT
  USING (true);

-- Create private_messages table
CREATE TABLE IF NOT EXISTS public.private_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  message TEXT NOT NULL,
  media_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can send private messages"
  ON public.private_messages FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "Users can view their private messages"
  ON public.private_messages FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "Users can update their sent messages"
  ON public.private_messages FOR UPDATE
  USING (from_user_id = auth.uid());

-- Create hidden_posts table
CREATE TABLE IF NOT EXISTS public.hidden_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  post_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.hidden_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can hide posts"
  ON public.hidden_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their hidden posts"
  ON public.hidden_posts FOR SELECT
  USING (user_id = auth.uid());

-- Update user_profiles table with new fields
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reactions INTEGER DEFAULT 0;

-- Create function to update follower counts
CREATE OR REPLACE FUNCTION update_follower_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment follower count for the user being followed
    UPDATE user_profiles 
    SET follower_count = follower_count + 1 
    WHERE id = NEW.following_id;
    
    -- Increment following count for the follower
    UPDATE user_profiles 
    SET following_count = following_count + 1 
    WHERE id = NEW.follower_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement follower count
    UPDATE user_profiles 
    SET follower_count = GREATEST(follower_count - 1, 0) 
    WHERE id = OLD.following_id;
    
    -- Decrement following count
    UPDATE user_profiles 
    SET following_count = GREATEST(following_count - 1, 0) 
    WHERE id = OLD.follower_id;
    
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for follower counts
DROP TRIGGER IF EXISTS followers_count_trigger ON public.followers;
CREATE TRIGGER followers_count_trigger
  AFTER INSERT OR DELETE ON public.followers
  FOR EACH ROW EXECUTE FUNCTION update_follower_counts();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON public.followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following_id ON public.followers(following_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_from ON public.private_messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_to ON public.private_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_posts_user ON public.hidden_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_posts_post ON public.hidden_posts(post_id);
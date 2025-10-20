-- Fix RLS policies for post deletion
DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;
CREATE POLICY "Users can delete their own posts" ON posts
  FOR DELETE USING (user_id = auth.uid());

-- Add RLS policy for private message deletion
DROP POLICY IF EXISTS "Users can delete their sent messages" ON private_messages;
CREATE POLICY "Users can delete their sent messages" ON private_messages
  FOR DELETE USING (from_user_id = auth.uid());

-- Create function to update post count
CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    UPDATE user_profiles 
    SET post_count = post_count + 1 
    WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    UPDATE user_profiles 
    SET post_count = GREATEST(post_count - 1, 0) 
    WHERE id = OLD.user_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'approved' THEN
      UPDATE user_profiles 
      SET post_count = post_count + 1 
      WHERE id = NEW.user_id;
    ELSIF OLD.status = 'approved' THEN
      UPDATE user_profiles 
      SET post_count = GREATEST(post_count - 1, 0) 
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for post count
DROP TRIGGER IF EXISTS update_post_count_trigger ON posts;
CREATE TRIGGER update_post_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_count();

-- Create function to update reaction count
CREATE OR REPLACE FUNCTION update_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_profiles 
    SET total_reactions = total_reactions + 1 
    WHERE id = (SELECT user_id FROM posts WHERE id = NEW.post_id);
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_profiles 
    SET total_reactions = GREATEST(total_reactions - 1, 0) 
    WHERE id = (SELECT user_id FROM posts WHERE id = OLD.post_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for reaction count
DROP TRIGGER IF EXISTS update_reaction_count_trigger ON post_likes;
CREATE TRIGGER update_reaction_count_trigger
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION update_reaction_count();

-- Create storyline_reactions table for story reactions
CREATE TABLE IF NOT EXISTS storyline_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storyline_id UUID NOT NULL REFERENCES user_storylines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(storyline_id, user_id)
);

ALTER TABLE storyline_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can add story reactions"
  ON storyline_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view story reactions"
  ON storyline_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can remove their own story reactions"
  ON storyline_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Create function to notify on story reactions
CREATE OR REPLACE FUNCTION notify_story_reaction()
RETURNS TRIGGER AS $$
DECLARE
  story_owner_id UUID;
  reactor_profile RECORD;
BEGIN
  -- Get story owner
  SELECT user_id INTO story_owner_id 
  FROM user_storylines 
  WHERE id = NEW.storyline_id;
  
  -- Don't notify if reacting to own story
  IF story_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;
  
  -- Get reactor profile
  SELECT username, avatar_url INTO reactor_profile
  FROM user_profiles
  WHERE id = NEW.user_id;
  
  -- Create notification
  INSERT INTO user_notifications (
    user_id, 
    title, 
    message, 
    type, 
    notification_category,
    action_data
  ) VALUES (
    story_owner_id,
    'Story Reaction',
    reactor_profile.username || ' reacted to your story',
    'info',
    'story_reaction',
    jsonb_build_object(
      'username', reactor_profile.username,
      'avatar_url', reactor_profile.avatar_url,
      'storyline_id', NEW.storyline_id,
      'reactor_id', NEW.user_id
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for story reaction notifications
DROP TRIGGER IF EXISTS notify_story_reaction_trigger ON storyline_reactions;
CREATE TRIGGER notify_story_reaction_trigger
  AFTER INSERT ON storyline_reactions
  FOR EACH ROW EXECUTE FUNCTION notify_story_reaction();
-- Update view counts to match actual views
UPDATE user_storylines us
SET view_count = (
  SELECT COUNT(*) FROM story_views sv 
  WHERE sv.story_id = us.id
);

-- Update post view counts similarly
UPDATE posts p
SET view_count = (
  SELECT COUNT(*) FROM post_views pv 
  WHERE pv.post_id = p.id
);

-- Grant initial ai_credits and voice_credits to users who don't have any
UPDATE user_profiles
SET ai_credits = CASE WHEN ai_credits IS NULL OR ai_credits = 0 THEN 250 ELSE ai_credits END,
    voice_credits = CASE WHEN voice_credits IS NULL OR voice_credits = 0 THEN 50 ELSE voice_credits END
WHERE ai_credits IS NULL OR ai_credits = 0 OR voice_credits IS NULL OR voice_credits = 0;
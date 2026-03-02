
-- Fix storage policy to allow voice/ and chat-files/ uploads
DROP POLICY IF EXISTS "Users can upload post media" ON storage.objects;
CREATE POLICY "Users can upload post media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'post-media' AND (
    -- Original pattern: userId/filename
    (auth.uid())::text = (storage.foldername(name))[1]
    OR
    -- Voice recordings: voice/userId/filename
    ((storage.foldername(name))[1] = 'voice' AND (auth.uid())::text = (storage.foldername(name))[2])
    OR
    -- Chat files: chat-files/userId/filename
    ((storage.foldername(name))[1] = 'chat-files' AND (auth.uid())::text = (storage.foldername(name))[2])
  )
);

-- Add UPDATE/DELETE policies for storage objects users own
DROP POLICY IF EXISTS "Users can delete own post media" ON storage.objects;
CREATE POLICY "Users can delete own post media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'post-media' AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR ((storage.foldername(name))[1] = 'voice' AND (auth.uid())::text = (storage.foldername(name))[2])
    OR ((storage.foldername(name))[1] = 'chat-files' AND (auth.uid())::text = (storage.foldername(name))[2])
  )
);

-- Create RPC to deduct voice credits (bypasses profile protection trigger)
CREATE OR REPLACE FUNCTION public.deduct_voice_credits(p_user_id uuid, p_recharge boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer;
  v_stars integer;
BEGIN
  SET LOCAL app.bypass_profile_protection = 'true';
  
  SELECT voice_credits, star_balance INTO v_credits, v_stars
  FROM user_profiles WHERE id = p_user_id;
  
  IF p_recharge THEN
    IF v_stars < 20 THEN
      RETURN -1; -- Not enough stars
    END IF;
    UPDATE user_profiles
    SET voice_credits = 10, star_balance = star_balance - 20
    WHERE id = p_user_id;
    
    INSERT INTO user_notifications (user_id, title, message, type, notification_category)
    VALUES (p_user_id, 'Voice Credits Recharged', '20 Stars deducted. 10 voice recordings added!', 'system', 'billing');
    
    RETURN 10;
  ELSE
    -- Just deduct 1 credit
    UPDATE user_profiles
    SET voice_credits = GREATEST(0, COALESCE(voice_credits, 10) - 1)
    WHERE id = p_user_id;
    
    RETURN GREATEST(0, COALESCE(v_credits, 10) - 1);
  END IF;
END;
$$;

-- Create notifications delete policy
DROP POLICY IF EXISTS "Users can delete their own notifications" ON user_notifications;
CREATE POLICY "Users can delete their own notifications"
ON user_notifications FOR DELETE
USING (user_id = auth.uid());

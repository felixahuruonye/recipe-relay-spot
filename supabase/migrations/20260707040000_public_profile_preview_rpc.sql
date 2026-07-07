-- The user_profiles RLS policy now requires auth.uid() IS NOT NULL for any
-- SELECT, which correctly protects private data - but it also silently
-- blocks our public referral-link-preview Edge Function (which has no logged
-- in user). This RPC exposes only the 3 harmless public fields needed for a
-- link preview, safely, without loosening the table's RLS.

CREATE OR REPLACE FUNCTION public.get_public_profile_preview(p_id_prefix text)
RETURNS TABLE(username text, avatar_url text, bio text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT username, avatar_url, bio
  FROM public.user_profiles
  WHERE id::text ILIKE p_id_prefix || '%'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile_preview(text) TO anon, authenticated;

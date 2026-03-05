
-- Fix delete_own_group to handle all FK references
CREATE OR REPLACE FUNCTION public.delete_own_group(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller owns the group
  IF NOT EXISTS (
    SELECT 1 FROM public.groups WHERE id = p_group_id AND owner_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not the group owner');
  END IF;

  -- Delete all references first
  DELETE FROM public.post_shares WHERE target_group_id = p_group_id;
  DELETE FROM public.group_messages WHERE group_id = p_group_id;
  DELETE FROM public.group_members WHERE group_id = p_group_id;
  DELETE FROM public.groups WHERE id = p_group_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

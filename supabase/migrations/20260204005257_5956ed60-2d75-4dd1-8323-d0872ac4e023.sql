CREATE OR REPLACE FUNCTION public.spend_stars(
  p_amount integer,
  p_type text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_balance integer;
BEGIN
  -- allow controlled updates to protected fields
  PERFORM set_config('app.bypass_profile_protection', '1', true);

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT COALESCE(star_balance, 0)
  INTO v_balance
  FROM public.user_profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    -- create minimal profile row if missing
    INSERT INTO public.user_profiles (id, username, full_name)
    VALUES (v_uid, 'user_' || substring(v_uid::text, 1, 8), '')
    ON CONFLICT (id) DO NOTHING;

    v_balance := 0;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stars', 'required', p_amount, 'available', v_balance);
  END IF;

  UPDATE public.user_profiles
  SET star_balance = v_balance - p_amount,
      updated_at = now()
  WHERE id = v_uid;

  INSERT INTO public.wallet_history (user_id, type, amount, currency, meta)
  VALUES (v_uid, p_type, -p_amount, 'STARS', COALESCE(p_meta, '{}'::jsonb));

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance - p_amount);
END;
$$;
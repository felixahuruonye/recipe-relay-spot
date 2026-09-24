-- ============================================================
-- PHASE 2: PROVIDER INTEGRATION CONFIG
-- Lets admin plug in each network's real site ID / postback-ready
-- launch URL once they have an account — no code changes needed
-- afterward. Stored inside the existing api_credentials jsonb
-- column (added in the original v2 migration).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_provider_config(
  p_provider_id text, p_enabled boolean DEFAULT NULL, p_maintenance_mode boolean DEFAULT NULL,
  p_user_reward_percent numeric DEFAULT NULL, p_platform_margin_percent numeric DEFAULT NULL,
  p_fraud_reserve_percent numeric DEFAULT NULL, p_stars_per_usd_user_share numeric DEFAULT NULL,
  p_min_reward_stars numeric DEFAULT NULL, p_max_reward_stars numeric DEFAULT NULL,
  p_min_age integer DEFAULT NULL, p_featured boolean DEFAULT NULL, p_sort_order integer DEFAULT NULL,
  p_launch_url_template text DEFAULT NULL, p_embed_type text DEFAULT NULL, p_site_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE task_provider_config SET
    enabled = COALESCE(p_enabled, enabled),
    maintenance_mode = COALESCE(p_maintenance_mode, maintenance_mode),
    user_reward_percent = COALESCE(p_user_reward_percent, user_reward_percent),
    platform_margin_percent = COALESCE(p_platform_margin_percent, platform_margin_percent),
    fraud_reserve_percent = COALESCE(p_fraud_reserve_percent, fraud_reserve_percent),
    stars_per_usd_user_share = COALESCE(p_stars_per_usd_user_share, stars_per_usd_user_share),
    min_reward_stars = COALESCE(p_min_reward_stars, min_reward_stars),
    max_reward_stars = COALESCE(p_max_reward_stars, max_reward_stars),
    min_age = COALESCE(p_min_age, min_age),
    featured = COALESCE(p_featured, featured),
    sort_order = COALESCE(p_sort_order, sort_order),
    api_credentials = CASE WHEN p_launch_url_template IS NOT NULL
      THEN jsonb_set(api_credentials, '{launch_url_template}', to_jsonb(p_launch_url_template))
      ELSE api_credentials END
  WHERE provider_id = p_provider_id;

  -- Separate statements per jsonb sub-field: this table is tiny and
  -- admin-only, so the extra round trips cost nothing and keep each
  -- update unambiguous.
  IF p_embed_type IS NOT NULL THEN
    UPDATE task_provider_config SET api_credentials = jsonb_set(api_credentials, '{embed_type}', to_jsonb(p_embed_type))
    WHERE provider_id = p_provider_id;
  END IF;
  IF p_site_id IS NOT NULL THEN
    UPDATE task_provider_config SET api_credentials = jsonb_set(api_credentials, '{site_id}', to_jsonb(p_site_id))
    WHERE provider_id = p_provider_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END; $$;

-- ------------------------------------------------------------
-- Task previews now also return the integration config, so the
-- frontend knows whether a real offerwall/locker is wired up yet
-- (launch_url_template set) or still needs the admin to paste in
-- real network credentials.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
    SELECT
      provider_id, display_name, category, featured, min_age, country_availability,
      GREATEST(1, FLOOR(0.50 * (user_reward_percent / 100.0) * COALESCE(stars_per_usd_user_share, 50))) AS preview_reward_stars,
      api_credentials ->> 'launch_url_template' AS launch_url_template,
      COALESCE(api_credentials ->> 'embed_type', 'link') AS embed_type,
      api_credentials ->> 'site_id' AS site_id
    FROM public.task_provider_config
    WHERE enabled = true AND maintenance_mode = false AND category <> 'advertising'
    ORDER BY sort_order ASC
  ) t;
  RETURN v_result;
END; $$;

-- ============================================================
-- FIX: admin_list_all_tasks() GROUP BY error + remove ALL
-- hardcoded/guessed numbers from the task preview. Nothing shows
-- on the Tasks page unless an admin has actually connected that
-- network (launch_url_template set). Lenory-internal tasks are
-- paused here entirely — revisited later under "content/advertise".
-- ============================================================

-- Fix: ORDER BY must be inside the subquery being aggregated, not
-- after it — referencing "source"/"title" post-aggregation is what
-- caused "column x.source must appear in the GROUP BY clause".
CREATE OR REPLACE FUNCTION public.admin_list_all_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_result FROM (
    SELECT id::text AS id, 'lenory' AS source, title, active AS visible, payout_stars
    FROM public.offer_tasks
    UNION ALL
    SELECT provider_id AS id, 'network' AS source, display_name AS title, enabled AS visible, NULL::numeric AS payout_stars
    FROM public.task_provider_config
    WHERE category <> 'advertising'
    ORDER BY 2, 3
  ) x;

  RETURN v_result;
END; $$;

-- No more guessed $0.50-payout math, no more "preview_reward_stars".
-- A provider only appears here once an admin has actually pasted in a
-- real launch_url_template — until then it simply isn't returned at
-- all, so the Tasks page shows nothing rather than a placeholder.
CREATE OR REPLACE FUNCTION public.get_available_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
    SELECT
      provider_id, display_name, category, featured, min_age, country_availability,
      api_credentials ->> 'launch_url_template' AS launch_url_template,
      COALESCE(api_credentials ->> 'embed_type', 'link') AS embed_type,
      api_credentials ->> 'site_id' AS site_id
    FROM public.task_provider_config
    WHERE enabled = true
      AND maintenance_mode = false
      AND category <> 'advertising'
      AND api_credentials ->> 'launch_url_template' IS NOT NULL
    ORDER BY sort_order ASC
  ) t;
  RETURN v_result;
END; $$;

-- Lenory-internal tasks paused entirely for now (handled later under
-- content/advertise) — deactivate everything, provider-named or not.
UPDATE public.offer_tasks SET active = false;

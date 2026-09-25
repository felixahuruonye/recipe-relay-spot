-- ============================================================
-- UNIFIED TASK VISIBILITY + MOCK TASK CLEANUP
-- ============================================================

-- Every "task" shown on the page — a Lenory-internal task (offer_tasks
-- row) or a network provider (task_provider_config row) — gets a
-- single hide/unhide path, keyed by its real ID.
CREATE OR REPLACE FUNCTION public.admin_list_all_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_result FROM (
    SELECT id::text AS id, 'lenory' AS source, title, active AS visible, payout_stars
    FROM public.offer_tasks
    UNION ALL
    SELECT provider_id AS id, 'network' AS source, display_name AS title, enabled AS visible, NULL::numeric AS payout_stars
    FROM public.task_provider_config
    WHERE category <> 'advertising'
  ) x
  ORDER BY source, title;

  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_task_visibility(p_id text, p_source text, p_visible boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF p_source = 'lenory' THEN
    UPDATE public.offer_tasks SET active = p_visible WHERE id = p_id::uuid;
  ELSIF p_source = 'network' THEN
    UPDATE public.task_provider_config SET enabled = p_visible WHERE provider_id = p_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_source');
  END IF;

  RETURN jsonb_build_object('success', true);
END; $$;

-- Old placeholder Lenory tasks that named a network in their title
-- (e.g. "Monlix Survey Wall") were fake — fixed stars claimed with no
-- real postback or conversion behind them, exactly what spec #13
-- forbids. Deactivated, not deleted, so you can review them in the
-- new Visibility tab before deciding to remove them permanently.
UPDATE public.offer_tasks SET active = false WHERE title ~* 'monlix|mylead|cpagrip|ogads|monetag';

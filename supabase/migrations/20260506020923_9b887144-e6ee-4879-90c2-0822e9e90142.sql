create or replace function public.record_authenticated_post_view(p_post_id text, p_viewer_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_already_viewed boolean := false;
begin
  if auth.uid() is null or auth.uid() <> p_viewer_id then
    return json_build_object('success', false, 'error', 'Not allowed');
  end if;

  select exists (
    select 1 from public.post_views
    where post_id = p_post_id and user_id = p_viewer_id
  ) into v_already_viewed;

  if v_already_viewed then
    return json_build_object('success', true, 'charged', false, 'already_viewed', true);
  end if;

  insert into public.post_views (post_id, user_id)
  values (p_post_id, p_viewer_id)
  on conflict do nothing;

  update public.posts
  set view_count = coalesce(view_count, 0) + 1
  where id = p_post_id and status = 'approved';

  if not found then
    return json_build_object('success', false, 'error', 'Post not found');
  end if;

  return json_build_object('success', true, 'charged', false, 'already_viewed', false, 'viewer_earn', 0);
end;
$function$;

grant execute on function public.record_authenticated_post_view(text, uuid) to authenticated;
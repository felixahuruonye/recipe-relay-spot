create or replace function public.record_public_post_view(p_post_id text)
returns json
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.posts
  set view_count = coalesce(view_count, 0) + 1
  where id = p_post_id and status = 'approved';

  if not found then
    return json_build_object('success', false, 'error', 'Post not found');
  end if;

  return json_build_object('success', true);
end;
$function$;

grant execute on function public.record_public_post_view(text) to anon, authenticated;
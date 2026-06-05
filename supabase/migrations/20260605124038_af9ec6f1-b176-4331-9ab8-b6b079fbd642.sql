create or replace function public.sync_post_view_count(p_post_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.bypass_profile_protection', '1', true);

  update public.posts p
  set view_count = coalesce((
    select count(*)::integer
    from public.post_views pv
    where pv.post_id = p_post_id
  ), 0)
  where p.id = p_post_id;
end;
$$;

grant execute on function public.sync_post_view_count(text) to authenticated, service_role;

create or replace function public.handle_post_views_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_post_view_count(coalesce(new.post_id, old.post_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_post_view_count on public.post_views;
create trigger trg_sync_post_view_count
after insert or delete on public.post_views
for each row execute function public.handle_post_views_count_sync();

update public.posts p
set view_count = coalesce(v.cnt, 0)
from (
  select p2.id, count(pv.id)::integer as cnt
  from public.posts p2
  left join public.post_views pv on pv.post_id = p2.id
  group by p2.id
) v
where p.id = v.id;

create or replace function public.record_public_post_view(p_post_id text)
returns json
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (select 1 from public.posts where id = p_post_id and status = 'approved') then
    return json_build_object('success', false, 'error', 'Post not found');
  end if;

  return json_build_object('success', true, 'counted', false, 'reason', 'login_required_for_profile_view_count');
end;
$function$;

grant execute on function public.record_public_post_view(text) to anon, authenticated;
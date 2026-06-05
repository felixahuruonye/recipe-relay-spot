drop policy if exists "Users can view their own post views" on public.post_views;

create policy "Viewers owners and admins can view post views"
on public.post_views
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.posts p
    where p.id = post_views.post_id
      and p.user_id = auth.uid()
  )
  or public.has_role(auth.uid(), 'admin')
);
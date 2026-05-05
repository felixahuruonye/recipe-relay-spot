create or replace function public.process_post_view(p_post_id text, p_viewer_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_post record;
  v_view_exists boolean;
  v_viewer_stars bigint;
  v_uploader uuid;
  v_price bigint;
  v_track record;
  uploader_share numeric;
  musician_share numeric := 0;
  viewer_share numeric;
  platform_share numeric;
  star_value numeric := 300;
begin
  perform set_config('app.bypass_profile_protection', '1', true);

  select id, user_id, star_price, music_track_id
  into v_post
  from public.posts
  where id = p_post_id and status = 'approved';

  if not found then
    return json_build_object('success', false, 'error', 'Post not found');
  end if;

  v_uploader := v_post.user_id;
  v_price := coalesce(v_post.star_price, 0);

  select exists (
    select 1 from public.post_views
    where post_id = p_post_id and user_id = p_viewer_id
  ) into v_view_exists;

  if v_view_exists then
    return json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', true);
  end if;

  if v_price <= 0 or v_uploader = p_viewer_id then
    insert into public.post_views (post_id, user_id) values (p_post_id, p_viewer_id);
    update public.posts set view_count = coalesce(view_count, 0) + 1 where id = p_post_id;
    return json_build_object('success', true, 'viewer_earn', 0, 'charged', false, 'already_viewed', false, 'free', true);
  end if;

  select coalesce(star_balance, 0) into v_viewer_stars
  from public.user_profiles
  where id = p_viewer_id;

  if v_viewer_stars < v_price then
    insert into public.post_views (post_id, user_id) values (p_post_id, p_viewer_id);
    update public.posts set view_count = coalesce(view_count, 0) + 1 where id = p_post_id;
    return json_build_object('success', true, 'charged', false, 'insufficient_stars', true, 'required', v_price, 'available', v_viewer_stars, 'viewer_earn', 0, 'uploader_earn', 0, 'musician_earn', 0, 'stars_spent', 0);
  end if;

  if v_post.music_track_id is not null then
    select id, artist_id, title into v_track
    from public.music_tracks
    where id = v_post.music_track_id;
  end if;

  if v_track.artist_id is not null and v_track.artist_id <> v_uploader then
    uploader_share := v_price * star_value * 0.30;
    musician_share := v_price * star_value * 0.10;
  else
    uploader_share := v_price * star_value * 0.40;
    musician_share := 0;
  end if;

  viewer_share := v_price * star_value * 0.35;
  platform_share := v_price * star_value * 0.25;

  update public.user_profiles set star_balance = star_balance - v_price where id = p_viewer_id;
  update public.user_profiles set wallet_balance = coalesce(wallet_balance, 0) + uploader_share, total_earned = coalesce(total_earned, 0) + uploader_share where id = v_uploader;
  if musician_share > 0 then
    update public.user_profiles set wallet_balance = coalesce(wallet_balance, 0) + musician_share, total_earned = coalesce(total_earned, 0) + musician_share where id = v_track.artist_id;
  end if;
  update public.user_profiles set wallet_balance = coalesce(wallet_balance, 0) + viewer_share where id = p_viewer_id;

  insert into public.post_views (post_id, user_id) values (p_post_id, p_viewer_id);
  update public.posts set view_count = coalesce(view_count, 0) + 1 where id = p_post_id;

  insert into public.wallet_history (user_id, type, amount, currency, meta) values
    (v_uploader, 'upload_earn', uploader_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'stars_spent', v_price, 'viewer_id', p_viewer_id::text)),
    (p_viewer_id, 'view_earn', viewer_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'stars_spent', v_price));

  if musician_share > 0 then
    insert into public.wallet_history (user_id, type, amount, currency, meta) values
      (v_track.artist_id, 'music_royalty', musician_share, 'NGN', jsonb_build_object('post_id', p_post_id, 'track_id', v_track.id, 'track_title', v_track.title, 'stars_spent', v_price, 'viewer_id', p_viewer_id::text));
  end if;

  insert into public.view_transactions (post_id, viewer_id, uploader_id, star_price, uploader_share, viewer_share, platform_share)
  values (p_post_id, p_viewer_id, v_uploader, v_price, uploader_share, viewer_share, platform_share);

  insert into public.user_notifications (user_id, title, message, type, notification_category, related_id, action_data)
  values
    (v_uploader, 'Post Earned! ⭐', format('You earned ₦%s from your post!', uploader_share), 'success', 'post_earn', p_post_id, jsonb_build_object('post_id', p_post_id, 'amount', uploader_share)),
    (p_viewer_id, 'Cashback! 💰', format('You earned ₦%s cashback!', viewer_share), 'success', 'view_cashback', p_post_id, jsonb_build_object('post_id', p_post_id, 'amount', viewer_share));

  if musician_share > 0 then
    insert into public.user_notifications (user_id, title, message, type, notification_category, related_id, action_data)
    values (v_track.artist_id, 'Music Royalty 🎵', format('You earned ₦%s from your sound!', musician_share), 'success', 'music_royalty', p_post_id, jsonb_build_object('post_id', p_post_id, 'track_id', v_track.id, 'amount', musician_share));
  end if;

  return json_build_object('success', true, 'viewer_earn', viewer_share, 'uploader_earn', uploader_share, 'musician_earn', musician_share, 'platform_earn', platform_share, 'charged', true, 'stars_spent', v_price);
end;
$function$;
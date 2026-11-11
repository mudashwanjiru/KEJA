create table if not exists public.vendor_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  stall_id uuid references public.stalls(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  likes_count integer not null default 0 check (likes_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists vendor_posts_public_feed_idx
  on public.vendor_posts (created_at desc)
  where status = 'approved';

create table if not exists public.vendor_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.vendor_posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')
    and ((media_type = 'image' and mime_type like 'image/%')
      or (media_type = 'video' and mime_type like 'video/%'))
  ),
  file_size_bytes integer not null check (file_size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.vendor_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_display_name text not null check (char_length(btrim(author_display_name)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists vendor_post_comments_post_idx
  on public.vendor_post_comments (post_id, created_at);

create table if not exists public.vendor_post_likes (
  post_id uuid not null references public.vendor_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.vendor_posts enable row level security;
alter table public.vendor_post_media enable row level security;
alter table public.vendor_post_comments enable row level security;
alter table public.vendor_post_likes enable row level security;

revoke all on table public.vendor_posts from public, anon, authenticated;
revoke all on table public.vendor_post_media from public, anon, authenticated;
revoke all on table public.vendor_post_comments from public, anon, authenticated;
revoke all on table public.vendor_post_likes from public, anon, authenticated;

grant select (id, stall_id, body, status, likes_count, created_at) on public.vendor_posts to anon, authenticated;
grant insert (owner_id, stall_id, body, status) on public.vendor_posts to authenticated;
grant delete on public.vendor_posts to authenticated;
revoke update on public.vendor_posts from public, anon, authenticated;
revoke update (status) on public.vendor_posts from public, anon, authenticated;
grant update (status) on public.vendor_posts to authenticated;
grant select (id, post_id, storage_path, media_type, mime_type, file_size_bytes, created_at)
  on public.vendor_post_media to anon, authenticated;
grant insert (post_id, owner_id, storage_path, media_type, mime_type, file_size_bytes)
  on public.vendor_post_media to authenticated;
grant delete on public.vendor_post_media to authenticated;
grant select (id, post_id, author_display_name, body, created_at)
  on public.vendor_post_comments to anon, authenticated;
grant insert (post_id, author_id, author_display_name, body)
  on public.vendor_post_comments to authenticated;
grant select (post_id, user_id) on public.vendor_post_likes to authenticated;
grant insert (post_id, user_id) on public.vendor_post_likes to authenticated;
grant delete on public.vendor_post_likes to authenticated;

drop policy if exists vendor_posts_read_approved_or_owner_or_reviewer on public.vendor_posts;
create policy vendor_posts_read_approved_or_owner_or_reviewer
  on public.vendor_posts
  for select
  to anon, authenticated
  using (
    (status = 'approved' and private.is_active_subscription(owner_id))
    or owner_id = (select auth.uid())
    or private.current_user_is_stall_reviewer()
  );

drop policy if exists vendor_posts_read_guard on public.vendor_posts;
create policy vendor_posts_read_guard
  on public.vendor_posts
  as restrictive
  for select
  to anon, authenticated
  using (
    (status = 'approved' and private.is_active_subscription(owner_id))
    or owner_id = (select auth.uid())
    or private.current_user_is_stall_reviewer()
  );

drop policy if exists vendor_posts_insert_subscriber on public.vendor_posts;
create policy vendor_posts_insert_subscriber
  on public.vendor_posts
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.subscriptions
      where user_id = (select auth.uid())
        and active_until > now()
    )
  );

drop policy if exists vendor_posts_insert_guard on public.vendor_posts;
create policy vendor_posts_insert_guard
  on public.vendor_posts
  as restrictive
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'pending'
    and char_length(btrim(body)) between 1 and 2000
    and exists (
      select 1 from public.subscriptions
      where user_id = (select auth.uid())
        and active_until > now()
    )
  );

drop policy if exists vendor_posts_delete_own_pending on public.vendor_posts;
create policy vendor_posts_delete_own_pending
  on public.vendor_posts
  for delete
  to authenticated
  using (owner_id = (select auth.uid()) and status = 'pending');

drop policy if exists vendor_posts_reviewer_update on public.vendor_posts;
create policy vendor_posts_reviewer_update
  on public.vendor_posts
  for update
  to authenticated
  using (status = 'pending' and private.current_user_is_stall_reviewer())
  with check (status in ('approved', 'rejected') and private.current_user_is_stall_reviewer());

drop policy if exists vendor_posts_reviewer_update_guard on public.vendor_posts;
create policy vendor_posts_reviewer_update_guard
  on public.vendor_posts
  as restrictive
  for update
  to authenticated
  using (status = 'pending' and private.current_user_is_stall_reviewer())
  with check (status in ('approved', 'rejected') and private.current_user_is_stall_reviewer());

drop policy if exists vendor_posts_reviewer_update on public.vendor_posts;
create policy vendor_posts_reviewer_update
  on public.vendor_posts
  for update
  to authenticated
  using (status = 'pending' and private.current_user_is_stall_reviewer())
  with check (status in ('approved', 'rejected') and private.current_user_is_stall_reviewer());

drop policy if exists vendor_posts_reviewer_update_guard on public.vendor_posts;
create policy vendor_posts_reviewer_update_guard
  on public.vendor_posts
  as restrictive
  for update
  to authenticated
  using (status = 'pending' and private.current_user_is_stall_reviewer())
  with check (status in ('approved', 'rejected') and private.current_user_is_stall_reviewer());

drop policy if exists vendor_post_media_read_post on public.vendor_post_media;
create policy vendor_post_media_read_post
  on public.vendor_post_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and (
          (p.status = 'approved' and private.is_active_subscription(p.owner_id))
          or p.owner_id = (select auth.uid())
          or private.current_user_is_stall_reviewer()
        )
    )
  );

drop policy if exists vendor_post_media_read_guard on public.vendor_post_media;
create policy vendor_post_media_read_guard
  on public.vendor_post_media
  as restrictive
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and (
          (p.status = 'approved' and private.is_active_subscription(p.owner_id))
          or p.owner_id = (select auth.uid())
          or private.current_user_is_stall_reviewer()
        )
    )
  );

drop policy if exists vendor_post_media_insert_subscriber on public.vendor_post_media;
create policy vendor_post_media_insert_subscriber
  on public.vendor_post_media
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and p.owner_id = (select auth.uid())
        and p.status = 'pending'
    )
  );

drop policy if exists vendor_post_media_insert_guard on public.vendor_post_media;
create policy vendor_post_media_insert_guard
  on public.vendor_post_media
  as restrictive
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and file_size_bytes between 1 and 52428800
      and (
        mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')
        and ((media_type = 'image' and mime_type like 'image/%')
          or (media_type = 'video' and mime_type like 'video/%'))
      )
    and exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and p.owner_id = (select auth.uid())
        and p.status = 'pending'
    )
  );

create or replace function private.enforce_vendor_post_media_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_media_count integer;
begin
  perform 1
  from public.vendor_posts
  where id = new.post_id
  for update;

  if not found then
    raise exception 'Vendor post not found';
  end if;

  select count(*) into existing_media_count
  from public.vendor_post_media
  where post_id = new.post_id;

  if existing_media_count >= 5 then
    raise exception 'A vendor update can contain no more than five media files';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_vendor_post_media_limit() from public, anon, authenticated;

drop trigger if exists vendor_post_media_limit on public.vendor_post_media;
create trigger vendor_post_media_limit
  before insert on public.vendor_post_media
  for each row execute function private.enforce_vendor_post_media_limit();

drop policy if exists vendor_post_media_delete_own_pending on public.vendor_post_media;
create policy vendor_post_media_delete_own_pending
  on public.vendor_post_media
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.vendor_posts p
      where p.id = post_id and p.status = 'pending'
    )
  );

drop policy if exists vendor_post_comments_read_approved on public.vendor_post_comments;
create policy vendor_post_comments_read_approved
  on public.vendor_post_comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and p.status = 'approved'
        and private.is_active_subscription(p.owner_id)
    )
  );

drop policy if exists vendor_post_comments_read_guard on public.vendor_post_comments;
create policy vendor_post_comments_read_guard
  on public.vendor_post_comments
  as restrictive
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and p.status = 'approved'
        and private.is_active_subscription(p.owner_id)
    )
  );

drop policy if exists vendor_post_comments_insert_signed_in on public.vendor_post_comments;
create policy vendor_post_comments_insert_signed_in
  on public.vendor_post_comments
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and char_length(btrim(body)) between 1 and 1000
    and char_length(btrim(author_display_name)) between 1 and 60
    and exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and p.status = 'approved'
        and private.is_active_subscription(p.owner_id)
    )
  );

drop policy if exists vendor_post_likes_read_own on public.vendor_post_likes;
create policy vendor_post_likes_read_own
  on public.vendor_post_likes
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists vendor_post_likes_insert_approved on public.vendor_post_likes;
create policy vendor_post_likes_insert_approved
  on public.vendor_post_likes
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.vendor_posts p
      where p.id = post_id
        and p.status = 'approved'
        and private.is_active_subscription(p.owner_id)
    )
  );

drop policy if exists vendor_post_likes_delete_own on public.vendor_post_likes;
create policy vendor_post_likes_delete_own
  on public.vendor_post_likes
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.update_vendor_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    update public.vendor_posts set likes_count = likes_count + 1 where id = new.post_id;
    return new;
  end if;

  update public.vendor_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

revoke all on function private.update_vendor_post_like_count() from public, anon, authenticated;

drop trigger if exists vendor_post_likes_count on public.vendor_post_likes;
create trigger vendor_post_likes_count
  after insert or delete on public.vendor_post_likes
  for each row execute function private.update_vendor_post_like_count();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-updates',
  'vendor-updates',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vendor_updates_upload_own_pending_post on storage.objects;
create policy vendor_updates_upload_own_pending_post
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vendor-updates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.vendor_post_media m
      join public.vendor_posts p on p.id = m.post_id
      where m.storage_path = name
        and m.owner_id = (select auth.uid())
        and p.owner_id = (select auth.uid())
        and p.status = 'pending'
        and private.is_active_subscription(p.owner_id)
    )
  );

drop policy if exists vendor_updates_read_authorized_media on storage.objects;
create policy vendor_updates_read_authorized_media
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'vendor-updates'
    and exists (
      select 1
      from public.vendor_post_media m
      join public.vendor_posts p on p.id = m.post_id
      where m.storage_path = name
        and (
          (p.status = 'approved' and private.is_active_subscription(p.owner_id))
          or p.owner_id = (select auth.uid())
          or private.current_user_is_stall_reviewer()
        )
    )
  );

drop policy if exists vendor_updates_delete_own_files on storage.objects;
create policy vendor_updates_delete_own_files
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vendor-updates'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
create table if not exists public.stall_media (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null check (
    (media_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
    or (media_type = 'video' and mime_type in ('video/mp4', 'video/webm'))
  ),
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  constraint stall_media_owner_path_check
    check (storage_path like owner_id::text || '/' || stall_id::text || '/%')
);

create index if not exists stall_media_stall_position_idx
  on public.stall_media (stall_id, position, created_at);

alter table public.stall_media enable row level security;
revoke all on table public.stall_media from public, anon, authenticated;
grant select (id, stall_id, storage_path, media_type, mime_type, position, created_at)
  on public.stall_media to anon, authenticated;
grant insert (stall_id, owner_id, storage_path, media_type, mime_type, position)
  on public.stall_media to authenticated;
grant delete on public.stall_media to authenticated;

drop policy if exists stall_media_read_visible_or_owner on public.stall_media;
create policy stall_media_read_visible_or_owner
  on public.stall_media
  for select
  to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1
      from public.stalls
      where stalls.id = stall_media.stall_id
        and stalls.review_status = 'approved'
        and private.is_active_subscription(stalls.owner_id)
    )
  );

drop policy if exists stall_media_insert_owner on public.stall_media;
create policy stall_media_insert_owner
  on public.stall_media
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.stalls
      where stalls.id = stall_media.stall_id
        and stalls.owner_id = (select auth.uid())
    )
    and char_length(storage_path) <= 512
  );

drop policy if exists stall_media_delete_owner on public.stall_media;
create policy stall_media_delete_owner
  on public.stall_media
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create or replace function private.enforce_stall_media_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (
    select count(*)
    from public.stall_media
    where stall_id = new.stall_id
  ) >= 12 then
    raise exception 'A stall can have no more than 12 photos or videos';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_stall_media_limit() from public, anon, authenticated;
drop trigger if exists stall_media_limit on public.stall_media;
create trigger stall_media_limit
  before insert on public.stall_media
  for each row execute function private.enforce_stall_media_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'commercial-stall-media',
  'commercial-stall-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists commercial_stall_media_upload_owner on storage.objects;
create policy commercial_stall_media_upload_owner
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'commercial-stall-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.stall_media
      where stall_media.storage_path = name
        and stall_media.owner_id = (select auth.uid())
    )
  );

drop policy if exists commercial_stall_media_read_visible on storage.objects;
create policy commercial_stall_media_read_visible
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'commercial-stall-media'
    and exists (
      select 1
      from public.stall_media
      join public.stalls on stalls.id = stall_media.stall_id
      where stall_media.storage_path = name
        and (
          stall_media.owner_id = (select auth.uid())
          or (
            stalls.review_status = 'approved'
            and private.is_active_subscription(stalls.owner_id)
          )
        )
    )
  );

drop policy if exists commercial_stall_media_delete_owner on storage.objects;
create policy commercial_stall_media_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'commercial-stall-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

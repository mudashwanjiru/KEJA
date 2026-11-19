create table if not exists public.public_post_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.keja_directory_listings(id) on delete cascade,
  provider_id uuid references public.service_providers(id) on delete cascade,
  job_id uuid references public.property_jobs(id) on delete cascade,
  place_id uuid references public.neighborhood_places(id) on delete cascade,
  notice_id uuid references public.neighborhood_notices(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null check (
    (media_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
    or (media_type = 'video' and mime_type in ('video/mp4', 'video/webm'))
  ),
  position smallint not null default 0 check (position between 0 and 11),
  created_at timestamptz not null default now(),
  constraint public_post_media_one_parent check (
    num_nonnulls(listing_id, provider_id, job_id, place_id, notice_id) = 1
  ),
  constraint public_post_media_owner_path check (
    storage_path like owner_id::text || '/%'
  )
);

create index if not exists public_post_media_listing_idx
  on public.public_post_media (listing_id, position, created_at) where listing_id is not null;
create index if not exists public_post_media_provider_idx
  on public.public_post_media (provider_id, position, created_at) where provider_id is not null;
create index if not exists public_post_media_job_idx
  on public.public_post_media (job_id, position, created_at) where job_id is not null;
create index if not exists public_post_media_place_idx
  on public.public_post_media (place_id, position, created_at) where place_id is not null;
create index if not exists public_post_media_notice_idx
  on public.public_post_media (notice_id, position, created_at) where notice_id is not null;

alter table public.public_post_media enable row level security;
revoke all on public.public_post_media from public, anon, authenticated;
grant select (id, listing_id, provider_id, job_id, place_id, notice_id, storage_path, media_type, mime_type, position, created_at)
  on public.public_post_media to anon, authenticated;
grant insert (listing_id, provider_id, job_id, place_id, notice_id, owner_id, storage_path, media_type, mime_type, position)
  on public.public_post_media to authenticated;
grant delete on public.public_post_media to authenticated;

create or replace function private.can_manage_public_post_media(
  p_listing_id uuid,
  p_provider_id uuid,
  p_job_id uuid,
  p_place_id uuid,
  p_notice_id uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_owner_id = (select auth.uid())
    and (
      exists (select 1 from public.keja_directory_listings l where l.id = p_listing_id and l.owner_id = (select auth.uid()))
      or exists (select 1 from public.service_providers p where p.id = p_provider_id and p.user_id = (select auth.uid()))
      or exists (select 1 from public.property_jobs j where j.id = p_job_id and j.owner_id = (select auth.uid()))
      or exists (select 1 from public.neighborhood_places p where p.id = p_place_id and p.submitted_by = (select auth.uid()))
      or exists (select 1 from public.neighborhood_notices n where n.id = p_notice_id and n.owner_id = (select auth.uid()))
    );
$$;

create or replace function private.can_view_public_post_media(
  p_listing_id uuid,
  p_provider_id uuid,
  p_job_id uuid,
  p_place_id uuid,
  p_notice_id uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_owner_id = (select auth.uid())
    or private.is_platform_admin()
    or exists (select 1 from public.keja_directory_listings l where l.id = p_listing_id and l.status = 'approved')
    or exists (select 1 from public.service_providers p where p.id = p_provider_id and p.verification_status = 'verified')
    or exists (select 1 from public.property_jobs j where j.id = p_job_id and j.status = 'open')
    or exists (select 1 from public.neighborhood_places p where p.id = p_place_id and p.status = 'approved')
    or exists (select 1 from public.neighborhood_notices n where n.id = p_notice_id and n.status = 'approved');
$$;

revoke all on function private.can_manage_public_post_media(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_public_post_media(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_manage_public_post_media(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.can_view_public_post_media(uuid, uuid, uuid, uuid, uuid, uuid) to anon, authenticated;

drop policy if exists public_post_media_read_visible_or_owner on public.public_post_media;
create policy public_post_media_read_visible_or_owner
  on public.public_post_media for select to anon, authenticated
  using (private.can_view_public_post_media(listing_id, provider_id, job_id, place_id, notice_id, owner_id));

drop policy if exists public_post_media_insert_owner on public.public_post_media;
create policy public_post_media_insert_owner
  on public.public_post_media for insert to authenticated
  with check (
    private.can_manage_public_post_media(listing_id, provider_id, job_id, place_id, notice_id, owner_id)
  );

drop policy if exists public_post_media_delete_owner on public.public_post_media;
create policy public_post_media_delete_owner
  on public.public_post_media for delete to authenticated
  using (owner_id = (select auth.uid()));

create or replace function private.enforce_public_post_media_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count
  from public.public_post_media m
  where (new.listing_id is not null and m.listing_id = new.listing_id)
    or (new.provider_id is not null and m.provider_id = new.provider_id)
    or (new.job_id is not null and m.job_id = new.job_id)
    or (new.place_id is not null and m.place_id = new.place_id)
    or (new.notice_id is not null and m.notice_id = new.notice_id);
  if existing_count >= 12 then
    raise exception 'A post can have no more than 12 photos or videos';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_public_post_media_limit() from public, anon, authenticated;
drop trigger if exists public_post_media_limit on public.public_post_media;
create trigger public_post_media_limit
  before insert on public.public_post_media
  for each row execute function private.enforce_public_post_media_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-post-media',
  'public-post-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_post_media_upload_owner on storage.objects;
create policy public_post_media_upload_owner
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.public_post_media m
      where m.storage_path = name and m.owner_id = (select auth.uid())
    )
  );

drop policy if exists public_post_media_read_visible on storage.objects;
create policy public_post_media_read_visible
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'public-post-media'
    and exists (
      select 1 from public.public_post_media m
      where m.storage_path = name
        and private.can_view_public_post_media(m.listing_id, m.provider_id, m.job_id, m.place_id, m.notice_id, m.owner_id)
    )
  );

drop policy if exists public_post_media_delete_owner_file on storage.objects;
create policy public_post_media_delete_owner_file
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'public-post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

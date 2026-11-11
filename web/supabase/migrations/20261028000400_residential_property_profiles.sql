create table if not exists public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  monthly_rent numeric(12, 2) not null check (monthly_rent > 0),
  deposit numeric(12, 2) check (deposit is null or deposit >= 0),
  bedrooms smallint not null check (bedrooms >= 0),
  bathrooms numeric(3, 1) not null check (bathrooms > 0),
  size_sqm numeric(9, 2) check (size_sqm is null or size_sqm > 0),
  parking_spaces smallint not null default 0 check (parking_spaces >= 0),
  water_available boolean not null default false,
  electricity_available boolean not null default false,
  internet_available boolean not null default false,
  network_quality text,
  security_features text[] not null default '{}',
  gated_compound boolean not null default false,
  pets_allowed boolean not null default false,
  furnished boolean not null default false,
  floor_label text,
  amenities text[] not null default '{}',
  location_label text not null,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  location_precision text not null default 'approximate'
    check (location_precision in ('exact', 'approximate')),
  available_date date,
  listing_status text not null default 'draft'
    check (listing_status in ('draft', 'available', 'available_soon', 'occupied', 'rented', 'sold')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  contact_phone text,
  tour_url text check (tour_url is null or tour_url ~ '^https://'),
  area_livability_score smallint check (area_livability_score is null or area_livability_score between 0 and 100),
  livability_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_properties_public_search_idx
  on public.rental_properties (listing_status, monthly_rent)
  where listing_status in ('available', 'available_soon');

create table if not exists public.rental_property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null check (
    (
      media_type = 'image'
      and mime_type in ('image/jpeg', 'image/png', 'image/webp')
    )
    or (
      media_type = 'video'
      and mime_type in ('video/mp4', 'video/webm')
    )
  ),
  caption text check (caption is null or char_length(caption) <= 200),
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create index if not exists rental_property_media_property_idx
  on public.rental_property_media (property_id, position, created_at);

create table if not exists public.property_nearby_services (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in (
    'hospital', 'school', 'university', 'supermarket', 'pharmacy', 'bank',
    'atm', 'petrol_station', 'matatu_stage', 'bus_stop', 'railway_station',
    'restaurant', 'cafe', 'gym', 'mosque', 'church', 'police_station',
    'fire_station', 'park', 'shop', 'mpesa_agent', 'other'
  )),
  distance_m integer not null check (distance_m between 1 and 50000),
  created_at timestamptz not null default now()
);

create index if not exists property_nearby_services_property_idx
  on public.property_nearby_services (property_id, category, distance_m);

alter table public.rental_properties enable row level security;
alter table public.rental_property_media enable row level security;
alter table public.property_nearby_services enable row level security;

revoke all on public.rental_properties from public, anon, authenticated;
revoke all on public.rental_property_media from public, anon, authenticated;
revoke all on public.property_nearby_services from public, anon, authenticated;

grant select (
  id, title, description, monthly_rent, deposit, bedrooms, bathrooms, size_sqm,
  parking_spaces, water_available, electricity_available, internet_available,
  network_quality, security_features, gated_compound, pets_allowed, furnished,
  floor_label, amenities, location_label, latitude, longitude, location_precision,
  available_date, listing_status, verification_status, contact_phone, tour_url,
  area_livability_score, livability_updated_at, created_at, updated_at
) on public.rental_properties to anon, authenticated;
grant insert (
  owner_id, title, description, monthly_rent, deposit, bedrooms, bathrooms, size_sqm,
  parking_spaces, water_available, electricity_available, internet_available,
  network_quality, security_features, gated_compound, pets_allowed, furnished,
  floor_label, amenities, location_label, latitude, longitude, location_precision,
  available_date, listing_status, contact_phone, tour_url
) on public.rental_properties to authenticated;
grant update (
  title, description, monthly_rent, deposit, bedrooms, bathrooms, size_sqm,
  parking_spaces, water_available, electricity_available, internet_available,
  network_quality, security_features, gated_compound, pets_allowed, furnished,
  floor_label, amenities, location_label, latitude, longitude, location_precision,
  available_date, listing_status, contact_phone, tour_url
) on public.rental_properties to authenticated;
grant delete on public.rental_properties to authenticated;

grant select (id, property_id, storage_path, media_type, mime_type, caption, position, created_at)
  on public.rental_property_media to anon, authenticated;
grant insert (property_id, owner_id, storage_path, media_type, mime_type, caption, position)
  on public.rental_property_media to authenticated;
grant delete on public.rental_property_media to authenticated;

grant select (id, property_id, name, category, distance_m, created_at)
  on public.property_nearby_services to anon, authenticated;
grant insert (property_id, owner_id, name, category, distance_m)
  on public.property_nearby_services to authenticated;
grant update (name, category, distance_m) on public.property_nearby_services to authenticated;
grant delete on public.property_nearby_services to authenticated;

drop policy if exists rental_properties_read_published_or_owner on public.rental_properties;
create policy rental_properties_read_published_or_owner
  on public.rental_properties
  for select
  to anon, authenticated
  using (listing_status <> 'draft' or owner_id = (select auth.uid()));

drop policy if exists rental_properties_insert_own on public.rental_properties;
create policy rental_properties_insert_own
  on public.rental_properties
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists rental_properties_update_own on public.rental_properties;
create policy rental_properties_update_own
  on public.rental_properties
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists rental_properties_delete_own on public.rental_properties;
create policy rental_properties_delete_own
  on public.rental_properties
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists rental_property_media_read_visible_property on public.rental_property_media;
create policy rental_property_media_read_visible_property
  on public.rental_property_media
  for select
  to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.listing_status <> 'draft'
    )
  );

drop policy if exists rental_property_media_insert_own on public.rental_property_media;
create policy rental_property_media_insert_own
  on public.rental_property_media
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists rental_property_media_delete_own on public.rental_property_media;
create policy rental_property_media_delete_own
  on public.rental_property_media
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists property_nearby_services_read_visible_property on public.property_nearby_services;
create policy property_nearby_services_read_visible_property
  on public.property_nearby_services
  for select
  to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.listing_status <> 'draft'
    )
  );

drop policy if exists property_nearby_services_insert_own on public.property_nearby_services;
create policy property_nearby_services_insert_own
  on public.property_nearby_services
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists property_nearby_services_update_own on public.property_nearby_services;
create policy property_nearby_services_update_own
  on public.property_nearby_services
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists property_nearby_services_delete_own on public.property_nearby_services;
create policy property_nearby_services_delete_own
  on public.property_nearby_services
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rental-property-media',
  'rental-property-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rental_property_media_upload_own on storage.objects;
create policy rental_property_media_upload_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'rental-property-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.rental_property_media m
      join public.rental_properties p on p.id = m.property_id
      where m.storage_path = name
        and m.owner_id = (select auth.uid())
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists rental_property_media_read_authorized on storage.objects;
create policy rental_property_media_read_authorized
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'rental-property-media'
    and exists (
      select 1
      from public.rental_property_media m
      join public.rental_properties p on p.id = m.property_id
      where m.storage_path = name
        and (p.listing_status <> 'draft' or p.owner_id = (select auth.uid()))
    )
  );

drop policy if exists rental_property_media_delete_own_files on storage.objects;
create policy rental_property_media_delete_own_files
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'rental-property-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

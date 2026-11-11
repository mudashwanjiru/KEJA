create table if not exists public.platform_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('tenant', 'landlord', 'agent', 'caretaker', 'admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.rental_property_staff (
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('agent', 'caretaker')),
  created_at timestamptz not null default now(),
  primary key (property_id, staff_user_id),
  check (owner_id <> staff_user_id)
);

create index if not exists rental_property_staff_user_idx
  on public.rental_property_staff (staff_user_id, role);

create table if not exists public.rental_property_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);

create table if not exists public.rental_property_viewings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null,
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_property_viewings_owner_idx
  on public.rental_property_viewings (property_id, requested_at desc);

create table if not exists public.rental_property_reviews (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (property_id, author_id)
);

create index if not exists rental_property_reviews_public_idx
  on public.rental_property_reviews (property_id, created_at desc)
  where status = 'approved';

create table if not exists public.rental_property_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('fake_listing', 'incorrect_information', 'unavailable', 'scam', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.rental_property_maintenance (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  details text not null check (char_length(btrim(details)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_property_messages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists rental_property_messages_participants_idx
  on public.rental_property_messages (sender_id, recipient_id, created_at desc);

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  body text not null check (char_length(body) between 1 and 500),
  property_id uuid references public.rental_properties(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rental_property_views (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,
  viewed_at timestamptz not null default now()
);

alter table public.rental_properties
  add column if not exists listing_type text not null default 'rent'
    check (listing_type in ('rent', 'sale')),
  add column if not exists sale_price numeric(12, 2)
    check (sale_price is null or sale_price > 0),
  add column if not exists property_type text not null default 'apartment'
    check (property_type in ('apartment', 'house', 'bedsitter', 'studio', 'townhouse', 'other'));

alter table public.rental_properties alter column monthly_rent drop not null;
alter table public.rental_properties alter column verification_status set default 'pending';
update public.rental_properties
set verification_status = 'pending'
where verification_status = 'unverified';
alter table public.rental_properties
  add constraint rental_properties_price_by_listing_type
  check (
    (listing_type = 'rent' and monthly_rent is not null and sale_price is null)
    or (listing_type = 'sale' and sale_price is not null)
  );

drop index if exists public.rental_properties_public_search_idx;
create index if not exists platform_notifications_user_idx
  on public.platform_notifications (user_id, created_at desc);
create index if not exists rental_property_views_property_idx
  on public.rental_property_views (property_id, viewed_at desc);
create index if not exists rental_properties_public_search_idx
  on public.rental_properties (listing_type, listing_status, monthly_rent, sale_price)
  where listing_status in ('available', 'available_soon');

create or replace function private.enforce_rental_property_media_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  media_count integer;
begin
  perform 1 from public.rental_properties where id = new.property_id for update;
  if not found then
    raise exception 'Property not found';
  end if;

  select count(*) into media_count
  from public.rental_property_media
  where property_id = new.property_id;

  if media_count >= 12 then
    raise exception 'A property can contain no more than twelve photos or videos';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_rental_property_media_limit() from public, anon, authenticated;
drop trigger if exists rental_property_media_limit on public.rental_property_media;
create trigger rental_property_media_limit
  before insert on public.rental_property_media
  for each row execute function private.enforce_rental_property_media_limit();

alter table public.platform_user_roles enable row level security;
alter table public.rental_property_staff enable row level security;
alter table public.rental_property_favorites enable row level security;
alter table public.rental_property_viewings enable row level security;
alter table public.rental_property_reviews enable row level security;
alter table public.rental_property_reports enable row level security;
alter table public.rental_property_maintenance enable row level security;
alter table public.rental_property_messages enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.rental_property_views enable row level security;

revoke all on public.platform_user_roles from public, anon, authenticated;
revoke all on public.rental_property_staff from public, anon, authenticated;
revoke all on public.rental_property_favorites from public, anon, authenticated;
revoke all on public.rental_property_viewings from public, anon, authenticated;
revoke all on public.rental_property_reviews from public, anon, authenticated;
revoke all on public.rental_property_reports from public, anon, authenticated;
revoke all on public.rental_property_maintenance from public, anon, authenticated;
revoke all on public.rental_property_messages from public, anon, authenticated;
revoke all on public.platform_notifications from public, anon, authenticated;
revoke all on public.rental_property_views from public, anon, authenticated;

grant select, insert on public.platform_user_roles to authenticated;
grant select, insert, delete on public.rental_property_staff to authenticated;
grant select, insert, delete on public.rental_property_favorites to authenticated;
grant select, insert on public.rental_property_viewings to authenticated;
grant update (status) on public.rental_property_viewings to authenticated;
grant select, insert on public.rental_property_reviews to authenticated;
grant update (status) on public.rental_property_reviews to authenticated;
grant select, insert on public.rental_property_reports to authenticated;
grant update (status) on public.rental_property_reports to authenticated;
grant select, insert on public.rental_property_maintenance to authenticated;
grant update (status) on public.rental_property_maintenance to authenticated;
grant select, insert on public.rental_property_messages to authenticated;
grant select on public.platform_notifications to authenticated;
grant update (read_at) on public.platform_notifications to authenticated;
grant update (listing_type, sale_price, property_type) on public.rental_properties to authenticated;
grant select (listing_type, sale_price, property_type) on public.rental_properties to anon, authenticated;
grant insert (listing_type, sale_price, property_type) on public.rental_properties to authenticated;
grant select (owner_id) on public.rental_properties to authenticated;
revoke select (latitude, longitude) on public.rental_properties from anon, authenticated;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.platform_user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;
grant execute on function private.is_platform_admin() to anon, authenticated;

create or replace function public.record_rental_property_view(property_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.rental_properties
    where id = property_id
      and listing_status in ('available', 'available_soon')
      and verification_status = 'verified'
  ) then
    return;
  end if;

  insert into public.rental_property_views (property_id, viewer_id)
  values (property_id, (select auth.uid()));
end;
$$;

revoke all on function public.record_rental_property_view(uuid) from public, anon;
grant execute on function public.record_rental_property_view(uuid) to anon, authenticated;

create or replace function public.rental_property_map_points(property_ids uuid[])
returns table (property_id uuid, latitude double precision, longitude double precision, is_approximate boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.id,
    case
      when p.location_precision = 'exact' or p.owner_id = (select auth.uid()) then p.latitude
      else round(p.latitude::numeric, 2)::double precision
    end,
    case
      when p.location_precision = 'exact' or p.owner_id = (select auth.uid()) then p.longitude
      else round(p.longitude::numeric, 2)::double precision
    end,
    p.location_precision <> 'exact' and p.owner_id is distinct from (select auth.uid())
  from public.rental_properties p
  where p.id = any(property_ids)
    and p.latitude is not null
    and p.longitude is not null
    and (
      (p.listing_status in ('available', 'available_soon') and p.verification_status = 'verified')
      or p.owner_id = (select auth.uid())
    );
$$;

revoke all on function public.rental_property_map_points(uuid[]) from public;
grant execute on function public.rental_property_map_points(uuid[]) to anon, authenticated;

drop policy if exists platform_user_roles_read_self_or_admin on public.platform_user_roles;
create policy platform_user_roles_read_self_or_admin
  on public.platform_user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());
drop policy if exists platform_user_roles_insert_self_tenant_or_admin on public.platform_user_roles;
create policy platform_user_roles_insert_self_tenant_or_admin
  on public.platform_user_roles for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and role = 'tenant')
    or private.is_platform_admin()
  );

drop policy if exists rental_property_staff_read_owner_or_assigned on public.rental_property_staff;
create policy rental_property_staff_read_owner_or_assigned
  on public.rental_property_staff for select to authenticated
  using (owner_id = (select auth.uid()) or staff_user_id = (select auth.uid()) or private.is_platform_admin());
drop policy if exists rental_property_staff_insert_owner on public.rental_property_staff;
create policy rental_property_staff_insert_owner
  on public.rental_property_staff for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
  );
drop policy if exists rental_property_staff_delete_owner on public.rental_property_staff;
create policy rental_property_staff_delete_owner
  on public.rental_property_staff for delete to authenticated
  using (owner_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists rental_property_favorites_read_self on public.rental_property_favorites;
create policy rental_property_favorites_read_self
  on public.rental_property_favorites for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists rental_property_favorites_insert_self_visible on public.rental_property_favorites;
create policy rental_property_favorites_insert_self_visible
  on public.rental_property_favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id
        and p.listing_status in ('available', 'available_soon')
        and p.verification_status = 'verified'
    )
  );
drop policy if exists rental_property_favorites_delete_self on public.rental_property_favorites;
create policy rental_property_favorites_delete_self
  on public.rental_property_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rental_property_viewings_read_participants on public.rental_property_viewings;
create policy rental_property_viewings_read_participants
  on public.rental_property_viewings for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.rental_property_staff s
      where s.property_id = property_id and s.staff_user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );
drop policy if exists rental_property_viewings_insert_requester on public.rental_property_viewings;
create policy rental_property_viewings_insert_requester
  on public.rental_property_viewings for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'requested'
    and requested_at > now()
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id
        and p.listing_status in ('available', 'available_soon')
        and p.verification_status = 'verified'
    )
  );
drop policy if exists rental_property_viewings_update_owner_or_staff on public.rental_property_viewings;
create policy rental_property_viewings_update_owner_or_staff
  on public.rental_property_viewings for update to authenticated
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.rental_property_staff s
      where s.property_id = property_id and s.staff_user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  )
  with check (
    status in ('confirmed', 'declined', 'cancelled', 'completed')
    and (
      (requester_id = (select auth.uid()) and status = 'cancelled')
      or exists (
        select 1 from public.rental_properties p
        where p.id = property_id and p.owner_id = (select auth.uid())
      )
      or exists (
        select 1 from public.rental_property_staff s
        where s.property_id = property_id and s.staff_user_id = (select auth.uid())
      )
      or private.is_platform_admin()
    )
  );

drop policy if exists rental_property_reviews_read_approved_or_owner on public.rental_property_reviews;
create policy rental_property_reviews_read_approved_or_owner
  on public.rental_property_reviews for select to anon, authenticated
  using (
    status = 'approved'
    or author_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );
drop policy if exists rental_property_reviews_insert_self on public.rental_property_reviews;
create policy rental_property_reviews_insert_self
  on public.rental_property_reviews for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id
        and p.listing_status <> 'draft'
        and p.verification_status = 'verified'
        and p.owner_id <> (select auth.uid())
    )
  );
drop policy if exists rental_property_reviews_update_admin on public.rental_property_reviews;
create policy rental_property_reviews_update_admin
  on public.rental_property_reviews for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists rental_property_reports_read_reporter_or_admin on public.rental_property_reports;
create policy rental_property_reports_read_reporter_or_admin
  on public.rental_property_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_platform_admin());
drop policy if exists rental_property_reports_insert_self on public.rental_property_reports;
create policy rental_property_reports_insert_self
  on public.rental_property_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'pending');
drop policy if exists rental_property_reports_update_admin on public.rental_property_reports;
create policy rental_property_reports_update_admin
  on public.rental_property_reports for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists rental_property_maintenance_read_reporter_owner_staff on public.rental_property_maintenance;
create policy rental_property_maintenance_read_reporter_owner_staff
  on public.rental_property_maintenance for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.rental_property_staff s
      where s.property_id = property_id and s.staff_user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );
drop policy if exists rental_property_maintenance_insert_assigned on public.rental_property_maintenance;
create policy rental_property_maintenance_insert_assigned
  on public.rental_property_maintenance for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (
      exists (
        select 1 from public.rental_properties p
        where p.id = property_id and p.owner_id = (select auth.uid())
      )
      or exists (
        select 1 from public.rental_property_staff s
        where s.property_id = property_id and s.staff_user_id = (select auth.uid())
      )
    )
  );
drop policy if exists rental_property_maintenance_update_owner_staff_admin on public.rental_property_maintenance;
create policy rental_property_maintenance_update_owner_staff_admin
  on public.rental_property_maintenance for update to authenticated
  using (
    exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.rental_property_staff s
      where s.property_id = property_id and s.staff_user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  )
  with check (status in ('open', 'in_progress', 'resolved'));

drop policy if exists rental_property_messages_read_participants on public.rental_property_messages;
create policy rental_property_messages_read_participants
  on public.rental_property_messages for select to authenticated
  using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.rental_property_staff s
      where s.property_id = property_id and s.staff_user_id = (select auth.uid())
    )
  );
drop policy if exists rental_property_messages_insert_sender on public.rental_property_messages;
create policy rental_property_messages_insert_sender
  on public.rental_property_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = property_id
        and p.listing_status <> 'draft'
        and p.verification_status = 'verified'
        and (
          recipient_id = p.owner_id
          or exists (
            select 1 from public.rental_property_staff s
            where s.property_id = p.id and s.staff_user_id = recipient_id
          )
        )
    )
  );

drop policy if exists platform_notifications_read_self on public.platform_notifications;
create policy platform_notifications_read_self
  on public.platform_notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists platform_notifications_update_self on public.platform_notifications;
create policy platform_notifications_update_self
  on public.platform_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists rental_properties_read_published_or_owner on public.rental_properties;
create policy rental_properties_read_published_or_owner
  on public.rental_properties for select to anon, authenticated
  using (
    (listing_status <> 'draft' and verification_status = 'verified')
    or owner_id = (select auth.uid())
    or exists (
      select 1 from public.rental_property_staff s
      where s.property_id = id and s.staff_user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

drop policy if exists rental_property_media_read_visible_property on public.rental_property_media;
create policy rental_property_media_read_visible_property
  on public.rental_property_media for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id
        and (
          (p.listing_status <> 'draft' and p.verification_status = 'verified')
          or p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.rental_property_staff s
            where s.property_id = p.id and s.staff_user_id = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

drop policy if exists property_nearby_services_read_visible_property on public.property_nearby_services;
create policy property_nearby_services_read_visible_property
  on public.property_nearby_services for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id
        and (
          (p.listing_status <> 'draft' and p.verification_status = 'verified')
          or p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.rental_property_staff s
            where s.property_id = p.id and s.staff_user_id = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

drop policy if exists rental_property_media_read_authorized on storage.objects;
create policy rental_property_media_read_authorized
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'rental-property-media'
    and exists (
      select 1
      from public.rental_property_media m
      join public.rental_properties p on p.id = m.property_id
      where m.storage_path = name
        and (
          (p.listing_status <> 'draft' and p.verification_status = 'verified')
          or p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.rental_property_staff s
            where s.property_id = p.id and s.staff_user_id = (select auth.uid())
          )
          or private.is_platform_admin()
        )
    )
  );

drop policy if exists rental_properties_admin_update_verification on public.rental_properties;
grant update (verification_status) on public.rental_properties to authenticated;
create policy rental_properties_admin_update_verification
  on public.rental_properties for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create or replace function private.guard_rental_property_verification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.verification_status is distinct from old.verification_status
    and not private.is_platform_admin()
  then
    raise exception 'Only an administrator can change property verification status';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_rental_property_verification() from public, anon, authenticated;
drop trigger if exists rental_property_verification_guard on public.rental_properties;
create trigger rental_property_verification_guard
  before update on public.rental_properties
  for each row execute function private.guard_rental_property_verification();

drop policy if exists rental_properties_agent_manage_assigned on public.rental_properties;
create policy rental_properties_agent_manage_assigned
  on public.rental_properties for update to authenticated
  using (
    exists (
      select 1 from public.rental_property_staff s
      where s.property_id = id
        and s.staff_user_id = (select auth.uid())
        and s.role = 'agent'
    )
  )
  with check (
    exists (
      select 1 from public.rental_property_staff s
      where s.property_id = id
        and s.staff_user_id = (select auth.uid())
        and s.role = 'agent'
    )
  );

create or replace function private.notify_property_viewing_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  property_owner uuid;
begin
  select owner_id into property_owner
  from public.rental_properties where id = new.property_id;

  if property_owner is not null then
    insert into public.platform_notifications (user_id, kind, body, property_id)
    values (
      property_owner,
      'viewing_request',
      'A new viewing request has been submitted.',
      new.property_id
    );
  end if;

  insert into public.platform_notifications (user_id, kind, body, property_id)
  select s.staff_user_id, 'viewing_request', 'A new viewing request has been submitted.', new.property_id
  from public.rental_property_staff s
  where s.property_id = new.property_id
    and s.role in ('agent', 'caretaker')
    and s.staff_user_id <> coalesce(property_owner, '00000000-0000-0000-0000-000000000000'::uuid);

  return new;
end;
$$;

revoke all on function private.notify_property_viewing_request() from public, anon, authenticated;
drop trigger if exists rental_property_viewing_request_notification on public.rental_property_viewings;
create trigger rental_property_viewing_request_notification
  after insert on public.rental_property_viewings
  for each row execute function private.notify_property_viewing_request();

create or replace function private.notify_property_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.platform_notifications (user_id, kind, body, property_id)
  values (new.recipient_id, 'property_message', 'A new property inquiry has arrived.', new.property_id);
  return new;
end;
$$;

revoke all on function private.notify_property_message() from public, anon, authenticated;
drop trigger if exists rental_property_message_notification on public.rental_property_messages;
create trigger rental_property_message_notification
  after insert on public.rental_property_messages
  for each row execute function private.notify_property_message();

create or replace function public.message_property_owner(property_id uuid, message_body text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  property_owner uuid;
begin
  if auth.uid() is null or char_length(btrim(message_body)) not between 1 and 4000 then
    raise exception 'Sign in and provide a message of up to 4,000 characters';
  end if;

  select owner_id into property_owner
  from public.rental_properties
  where id = property_id
    and listing_status <> 'draft'
    and verification_status = 'verified';

  if property_owner is null then
    raise exception 'Published property not found';
  end if;

  if property_owner = auth.uid() then
    raise exception 'You cannot message yourself';
  end if;

  insert into public.rental_property_messages (property_id, sender_id, recipient_id, body)
  values (property_id, auth.uid(), property_owner, btrim(message_body));
end;
$$;

revoke all on function public.message_property_owner(uuid, text) from public, anon;
grant execute on function public.message_property_owner(uuid, text) to authenticated;

create or replace function public.reply_to_property_inquiry(
  property_id uuid,
  recipient_id uuid,
  message_body text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or char_length(btrim(message_body)) not between 1 and 4000 then
    raise exception 'Sign in and provide a message of up to 4,000 characters';
  end if;

  if not exists (
    select 1 from public.rental_properties p
    where p.id = property_id
      and (
        p.owner_id = auth.uid()
        or exists (
          select 1 from public.rental_property_staff s
          where s.property_id = p.id and s.staff_user_id = auth.uid()
        )
      )
  ) then
    raise exception 'Property owner or assigned staff access required';
  end if;

  if not exists (
    select 1 from public.rental_property_messages m
    where m.property_id = reply_to_property_inquiry.property_id
      and (
        (m.sender_id = reply_to_property_inquiry.recipient_id and m.recipient_id = auth.uid())
        or (m.recipient_id = reply_to_property_inquiry.recipient_id and m.sender_id = auth.uid())
      )
  ) then
    raise exception 'The recipient must belong to an existing property conversation';
  end if;

  insert into public.rental_property_messages (property_id, sender_id, recipient_id, body)
  values (property_id, auth.uid(), recipient_id, btrim(message_body));
end;
$$;

revoke all on function public.reply_to_property_inquiry(uuid, uuid, text) from public, anon;
grant execute on function public.reply_to_property_inquiry(uuid, uuid, text) to authenticated;

create or replace function public.caretaker_update_availability(
  property_id uuid,
  new_status text,
  new_available_date date default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new_status not in ('available', 'available_soon', 'occupied') then
    raise exception 'Caretakers may only set available, available soon, or occupied status';
  end if;

  if not exists (
    select 1 from public.rental_property_staff
    where rental_property_staff.property_id = caretaker_update_availability.property_id
      and staff_user_id = (select auth.uid())
      and role = 'caretaker'
  ) then
    raise exception 'Caretaker assignment required';
  end if;

  update public.rental_properties
  set listing_status = new_status, available_date = new_available_date, updated_at = now()
  where id = property_id;
end;
$$;

revoke all on function public.caretaker_update_availability(uuid, text, date) from public, anon;
grant execute on function public.caretaker_update_availability(uuid, text, date) to authenticated;

create or replace function public.owner_rental_property_stats(property_id uuid)
returns table (view_count bigint, viewing_count bigint, message_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.rental_properties
    where id = property_id and owner_id = (select auth.uid())
  ) then
    raise exception 'Property owner access required';
  end if;

  return query
  select
    (select count(*) from public.rental_property_views v where v.property_id = owner_rental_property_stats.property_id),
    (select count(*) from public.rental_property_viewings v where v.property_id = owner_rental_property_stats.property_id),
    (select count(*) from public.rental_property_messages m where m.property_id = owner_rental_property_stats.property_id);
end;
$$;

revoke all on function public.owner_rental_property_stats(uuid) from public, anon;
grant execute on function public.owner_rental_property_stats(uuid) to authenticated;

create or replace function public.manager_rental_property_stats(property_id uuid)
returns table (view_count bigint, viewing_count bigint, message_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.rental_properties p
    where p.id = manager_rental_property_stats.property_id
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1 from public.rental_property_staff s
          where s.property_id = p.id and s.staff_user_id = (select auth.uid()) and s.role = 'agent'
        )
      )
  ) then
    raise exception 'Owner or assigned agent access required';
  end if;

  return query
  select
    (select count(*) from public.rental_property_views v where v.property_id = manager_rental_property_stats.property_id),
    (select count(*) from public.rental_property_viewings v where v.property_id = manager_rental_property_stats.property_id),
    (select count(*) from public.rental_property_messages m where m.property_id = manager_rental_property_stats.property_id);
end;
$$;

revoke all on function public.manager_rental_property_stats(uuid) from public, anon;
grant execute on function public.manager_rental_property_stats(uuid) to authenticated;

create or replace function public.admin_residential_dashboard_stats()
returns table (
  property_count bigint,
  available_count bigint,
  rented_count bigint,
  sold_count bigint,
  pending_verification_count bigint,
  pending_report_count bigint,
  user_count bigint,
  agent_count bigint,
  landlord_count bigint,
  caretaker_count bigint,
  views_today bigint,
  leads_today bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;

  return query
  select
    (select count(*) from public.rental_properties),
    (select count(*) from public.rental_properties where listing_status in ('available', 'available_soon')),
    (select count(*) from public.rental_properties where listing_status = 'rented'),
    (select count(*) from public.rental_properties where listing_status = 'sold'),
    (select count(*) from public.rental_properties where verification_status = 'pending'),
    (select count(*) from public.rental_property_reports where status in ('pending', 'reviewing')),
    (select count(*) from auth.users),
    (select count(distinct user_id) from public.platform_user_roles where role = 'agent')
      + (select count(distinct staff_user_id) from public.rental_property_staff where role = 'agent'),
    (select count(distinct owner_id) from public.rental_properties),
    (select count(distinct staff_user_id) from public.rental_property_staff where role = 'caretaker'),
    (select count(*) from public.rental_property_views where viewed_at >= date_trunc('day', now())),
    (select count(*) from public.rental_property_viewings where created_at >= date_trunc('day', now()));
end;
$$;

revoke all on function public.admin_residential_dashboard_stats() from public, anon;
grant execute on function public.admin_residential_dashboard_stats() to authenticated;

notify pgrst, 'reload schema';

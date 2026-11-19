alter table public.rental_properties
  add column if not exists building_name text check (building_name is null or char_length(building_name) <= 120),
  add column if not exists unit_number text check (unit_number is null or char_length(unit_number) <= 40),
  add column if not exists agency_id uuid,
  add column if not exists featured_until timestamptz;

create table if not exists public.rental_agencies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name),
  unique (id, owner_id)
);

create table if not exists public.rental_agency_members (
  agency_id uuid not null references public.rental_agencies(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('agent', 'caretaker')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id),
  check (owner_id <> user_id)
);

alter table public.rental_properties
  drop constraint if exists rental_properties_agency_owner_fk,
  add constraint rental_properties_agency_owner_fk
  foreign key (agency_id, owner_id)
  references public.rental_agencies(id, owner_id)
  on delete set null (agency_id);

alter table public.rental_agencies enable row level security;
alter table public.rental_agency_members enable row level security;

revoke all on public.rental_agencies, public.rental_agency_members from public, anon, authenticated;
grant select, insert, update, delete on public.rental_agencies to authenticated;
grant select, insert, delete on public.rental_agency_members to authenticated;

drop policy if exists rental_agencies_read_owner_member_admin on public.rental_agencies;
create policy rental_agencies_read_owner_member_admin
  on public.rental_agencies for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.rental_agency_members m
      where m.agency_id = id and m.user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

drop policy if exists rental_agencies_insert_owner on public.rental_agencies;
create policy rental_agencies_insert_owner
  on public.rental_agencies for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists rental_agencies_update_owner_admin on public.rental_agencies;
create policy rental_agencies_update_owner_admin
  on public.rental_agencies for update to authenticated
  using (owner_id = (select auth.uid()) or private.is_platform_admin())
  with check (owner_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists rental_agencies_delete_owner_admin on public.rental_agencies;
create policy rental_agencies_delete_owner_admin
  on public.rental_agencies for delete to authenticated
  using (owner_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists rental_agency_members_read_owner_or_self on public.rental_agency_members;
create policy rental_agency_members_read_owner_or_self
  on public.rental_agency_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or owner_id = (select auth.uid())
    or private.is_platform_admin()
  );

drop policy if exists rental_agency_members_insert_owner on public.rental_agency_members;
create policy rental_agency_members_insert_owner
  on public.rental_agency_members for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_agencies a
      where a.id = agency_id and a.owner_id = (select auth.uid())
    )
  );

drop policy if exists rental_agency_members_delete_owner on public.rental_agency_members;
create policy rental_agency_members_delete_owner
  on public.rental_agency_members for delete to authenticated
  using (owner_id = (select auth.uid()) or private.is_platform_admin());

grant select (building_name, unit_number, agency_id, featured_until)
  on public.rental_properties to anon, authenticated;
grant insert (building_name, unit_number, agency_id)
  on public.rental_properties to authenticated;
grant update (building_name, unit_number, agency_id)
  on public.rental_properties to authenticated;

create or replace function private.is_assigned_rental_property_staff(
  target_property_id uuid,
  required_role text default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.rental_property_staff s
    where s.property_id = target_property_id
      and s.staff_user_id = (select auth.uid())
      and (required_role is null or s.role = required_role)
  );
$$;

create or replace function private.is_rental_agency_agent_for_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.rental_properties p
    join public.rental_agency_members m on m.agency_id = p.agency_id
    where p.id = target_property_id
      and m.user_id = (select auth.uid())
      and m.role = 'agent'
  );
$$;

create or replace function private.can_view_rental_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.rental_properties p
    where p.id = target_property_id
      and (
        (p.listing_status <> 'draft' and p.verification_status = 'verified')
        or p.owner_id = (select auth.uid())
        or private.is_assigned_rental_property_staff(p.id)
        or private.is_rental_agency_agent_for_property(p.id)
        or private.is_platform_admin()
      )
  );
$$;

revoke all on function private.is_assigned_rental_property_staff(uuid, text) from public, anon, authenticated;
grant execute on function private.is_assigned_rental_property_staff(uuid, text) to anon, authenticated;
revoke all on function private.is_rental_agency_agent_for_property(uuid) from public, anon, authenticated;
grant execute on function private.is_rental_agency_agent_for_property(uuid) to anon, authenticated;
revoke all on function private.can_view_rental_property(uuid) from public, anon, authenticated;
grant execute on function private.can_view_rental_property(uuid) to anon, authenticated;

drop policy if exists rental_properties_read_published_or_owner on public.rental_properties;
create policy rental_properties_read_published_or_owner
  on public.rental_properties for select to anon, authenticated
  using (private.can_view_rental_property(id));

drop policy if exists rental_property_media_read_visible_property on public.rental_property_media;
create policy rental_property_media_read_visible_property
  on public.rental_property_media for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or private.can_view_rental_property(property_id)
  );

drop policy if exists property_nearby_services_read_visible_property on public.property_nearby_services;
create policy property_nearby_services_read_visible_property
  on public.property_nearby_services for select to anon, authenticated
  using (
    owner_id = (select auth.uid())
    or private.can_view_rental_property(property_id)
  );

drop policy if exists rental_property_media_read_authorized on storage.objects;
create policy rental_property_media_read_authorized
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'rental-property-media'
    and exists (
      select 1
      from public.rental_property_media m
      where m.storage_path = name
        and private.can_view_rental_property(m.property_id)
    )
  );

drop policy if exists rental_property_viewings_read_participants on public.rental_property_viewings;
create policy rental_property_viewings_read_participants
  on public.rental_property_viewings for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or private.is_assigned_rental_property_staff(property_id)
    or private.is_rental_agency_agent_for_property(property_id)
    or private.is_platform_admin()
  );

drop policy if exists rental_property_viewings_update_owner_or_staff on public.rental_property_viewings;
create policy rental_property_viewings_update_owner_or_staff
  on public.rental_property_viewings for update to authenticated
  using (
    (requester_id = (select auth.uid()) and status = 'requested')
    or exists (
      select 1 from public.rental_properties p
      where p.id = property_id and p.owner_id = (select auth.uid())
    )
    or private.is_assigned_rental_property_staff(property_id)
    or private.is_rental_agency_agent_for_property(property_id)
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
      or private.is_assigned_rental_property_staff(property_id)
      or private.is_rental_agency_agent_for_property(property_id)
      or private.is_platform_admin()
    )
  );

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
    or private.is_assigned_rental_property_staff(property_id)
    or private.is_rental_agency_agent_for_property(property_id)
    or private.is_platform_admin()
  );

create or replace function private.guard_rental_property_agency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.agency_id is distinct from old.agency_id
    and old.owner_id is distinct from (select auth.uid())
    and not private.is_platform_admin()
  then
    raise exception 'Only the property owner or an administrator can change its agency';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_rental_property_agency() from public, anon, authenticated;
drop trigger if exists rental_property_agency_guard on public.rental_properties;
create trigger rental_property_agency_guard
  before update on public.rental_properties
  for each row execute function private.guard_rental_property_agency();

drop policy if exists rental_properties_agent_manage_assigned on public.rental_properties;
create policy rental_properties_agent_manage_assigned
  on public.rental_properties for update to authenticated
  using (
    private.is_assigned_rental_property_staff(id, 'agent')
    or private.is_rental_agency_agent_for_property(id)
  )
  with check (
    private.is_assigned_rental_property_staff(id, 'agent')
    or private.is_rental_agency_agent_for_property(id)
  );

create table if not exists public.platform_user_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('landlord', 'agent')),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 120),
  business_name text check (business_name is null or char_length(business_name) <= 120),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 30),
  reference_url text check (reference_url is null or reference_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create unique index if not exists platform_user_verifications_one_pending
  on public.platform_user_verifications (user_id, account_type)
  where status = 'pending';

create table if not exists public.platform_account_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 5 and 1000),
  suspended_at timestamptz not null default now(),
  ends_at timestamptz,
  lifted_at timestamptz
);

create unique index if not exists platform_account_one_active_suspension
  on public.platform_account_suspensions (user_id)
  where lifted_at is null;

alter table public.platform_user_verifications enable row level security;
alter table public.platform_account_suspensions enable row level security;
revoke all on public.platform_user_verifications, public.platform_account_suspensions from public, anon, authenticated;
grant select on public.platform_user_verifications to authenticated;
grant insert (user_id, account_type, legal_name, business_name, contact_phone, reference_url)
  on public.platform_user_verifications to authenticated;
grant select on public.platform_account_suspensions to authenticated;
grant update (status, admin_note, reviewed_at, reviewed_by) on public.platform_user_verifications to authenticated;

drop policy if exists platform_user_verifications_read_self_admin on public.platform_user_verifications;
create policy platform_user_verifications_read_self_admin
  on public.platform_user_verifications for select to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists platform_user_verifications_insert_self on public.platform_user_verifications;
create policy platform_user_verifications_insert_self
  on public.platform_user_verifications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists platform_user_verifications_update_admin on public.platform_user_verifications;
create policy platform_user_verifications_update_admin
  on public.platform_user_verifications for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

drop policy if exists platform_account_suspensions_read_admin on public.platform_account_suspensions;
create policy platform_account_suspensions_read_admin
  on public.platform_account_suspensions for select to authenticated
  using (private.is_platform_admin());

create or replace function public.admin_review_platform_verification(
  request_id uuid,
  decision text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  verification_row public.platform_user_verifications%rowtype;
begin
  if not private.is_platform_admin() then
    raise exception 'Administrator access required';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into verification_row
  from public.platform_user_verifications
  where id = request_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending verification request not found';
  end if;

  update public.platform_user_verifications
  set status = decision,
      admin_note = nullif(btrim(note), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = request_id;

  if decision = 'approved' then
    insert into public.platform_user_roles (user_id, role)
    values (verification_row.user_id, verification_row.account_type)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.admin_review_platform_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_review_platform_verification(uuid, text, text) to authenticated;

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
        or exists (
          select 1 from public.rental_agency_members m
          where m.agency_id = p.agency_id and m.user_id = (select auth.uid()) and m.role = 'agent'
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
    (select count(distinct account.user_id) from (
      select user_id from public.platform_user_roles where role = 'agent'
      union
      select staff_user_id from public.rental_property_staff where role = 'agent'
      union
      select user_id from public.rental_agency_members where role = 'agent'
    ) account),
    (select count(distinct owner_id) from public.rental_properties),
    (select count(distinct account.user_id) from (
      select staff_user_id as user_id from public.rental_property_staff where role = 'caretaker'
      union
      select user_id from public.rental_agency_members where role = 'caretaker'
    ) account),
    (select count(*) from public.rental_property_views where viewed_at >= date_trunc('day', now())),
    (select count(*) from public.rental_property_viewings where created_at >= date_trunc('day', now()));
end;
$$;

revoke all on function public.admin_residential_dashboard_stats() from public, anon;
grant execute on function public.admin_residential_dashboard_stats() to authenticated;

notify pgrst, 'reload schema';

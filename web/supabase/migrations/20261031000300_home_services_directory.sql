create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  category text not null check (category in (
    'plumbing', 'electrical', 'cleaning', 'moving', 'painting',
    'carpentry', 'appliance_repair', 'pest_control', 'security', 'other'
  )),
  description text not null check (char_length(btrim(description)) between 20 and 3000),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 32),
  county text not null check (char_length(btrim(county)) between 1 and 80),
  town text not null check (char_length(btrim(town)) between 1 and 120),
  service_areas text[] not null default '{}',
  starting_price numeric(12, 2) check (starting_price is null or starting_price >= 0),
  years_experience smallint not null default 0 check (years_experience between 0 and 80),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_providers_public_search_idx
  on public.service_providers (county, category, town)
  where verification_status = 'verified';

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null check (char_length(btrim(requester_name)) between 2 and 120),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 32),
  county text not null check (char_length(btrim(county)) between 1 and 80),
  town text not null check (char_length(btrim(town)) between 1 and 120),
  details text not null check (char_length(btrim(details)) between 10 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'accepted', 'declined', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_requests_provider_created_idx
  on public.service_requests (provider_id, created_at desc);
create index if not exists service_requests_requester_created_idx
  on public.service_requests (requester_id, created_at desc);

alter table public.service_providers enable row level security;
alter table public.service_requests enable row level security;

revoke all on public.service_providers, public.service_requests from public, anon, authenticated;

grant select (id, business_name, category, description, contact_phone, county, town, service_areas, starting_price, years_experience, verification_status, created_at)
  on public.service_providers to anon, authenticated;
grant select (user_id) on public.service_providers to authenticated;
grant insert (user_id, business_name, category, description, contact_phone, county, town, service_areas, starting_price, years_experience)
  on public.service_providers to authenticated;
grant update (business_name, category, description, contact_phone, county, town, service_areas, starting_price, years_experience)
  on public.service_providers to authenticated;
grant update (verification_status) on public.service_providers to authenticated;

drop policy if exists service_providers_read_verified_or_owner_or_admin on public.service_providers;
create policy service_providers_read_verified_or_owner_or_admin
  on public.service_providers for select to anon, authenticated
  using (
    verification_status = 'verified'
    or user_id = (select auth.uid())
    or private.is_platform_admin()
  );

drop policy if exists service_providers_insert_self on public.service_providers;
create policy service_providers_insert_self
  on public.service_providers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and verification_status = 'pending'
  );

drop policy if exists service_providers_update_self on public.service_providers;
create policy service_providers_update_self
  on public.service_providers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists service_providers_admin_update on public.service_providers;
create policy service_providers_admin_update
  on public.service_providers for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create or replace function private.protect_service_provider_verification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_platform_admin() then
    if new.verification_status is distinct from old.verification_status then
      raise exception 'Only an administrator can change provider verification status';
    end if;

    if old.verification_status = 'verified' and (
      new.business_name is distinct from old.business_name
      or new.category is distinct from old.category
      or new.description is distinct from old.description
      or new.contact_phone is distinct from old.contact_phone
      or new.county is distinct from old.county
      or new.town is distinct from old.town
      or new.service_areas is distinct from old.service_areas
      or new.starting_price is distinct from old.starting_price
      or new.years_experience is distinct from old.years_experience
    ) then
      new.verification_status := 'pending';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_service_provider_verification() from public, anon, authenticated;
drop trigger if exists service_provider_verification_guard on public.service_providers;
create trigger service_provider_verification_guard
  before update on public.service_providers
  for each row execute function private.protect_service_provider_verification();

grant select (id, provider_id, requester_id, requester_name, contact_phone, county, town, details, status, created_at)
  on public.service_requests to authenticated;
grant insert (provider_id, requester_id, requester_name, contact_phone, county, town, details)
  on public.service_requests to authenticated;
grant update (status) on public.service_requests to authenticated;

drop policy if exists service_requests_read_participants on public.service_requests;
create policy service_requests_read_participants
  on public.service_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.service_providers
      where service_providers.id = service_requests.provider_id
        and service_providers.user_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

drop policy if exists service_requests_create_self on public.service_requests;
create policy service_requests_create_self
  on public.service_requests for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and exists (
      select 1 from public.service_providers
      where service_providers.id = service_requests.provider_id
        and service_providers.verification_status = 'verified'
        and service_providers.user_id is distinct from (select auth.uid())
    )
  );

drop policy if exists service_requests_update_provider on public.service_requests;
create policy service_requests_update_provider
  on public.service_requests for update to authenticated
  using (
    status in ('pending', 'contacted', 'accepted')
    and exists (
      select 1 from public.service_providers
      where service_providers.id = service_requests.provider_id
        and service_providers.user_id = (select auth.uid())
    )
  )
  with check (
    status in ('pending', 'contacted', 'accepted', 'declined', 'completed')
    and exists (
      select 1 from public.service_providers
      where service_providers.id = service_requests.provider_id
        and service_providers.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

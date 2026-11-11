alter table public.service_providers
  drop constraint if exists service_providers_category_check,
  add constraint service_providers_category_check check (category in (
    'plumbing', 'electrical', 'cleaning', 'moving', 'painting', 'carpentry',
    'appliance_repair', 'pest_control', 'security', 'construction', 'architecture',
    'surveying', 'landscaping', 'building_supplies', 'equipment_hire', 'storage',
    'relocation', 'other'
  ));

create table if not exists public.neighborhood_places (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null check (category in (
    'school', 'healthcare', 'market', 'transport', 'utility', 'recreation',
    'community', 'emergency', 'other'
  )),
  description text not null default '' check (char_length(description) <= 1000),
  county text not null check (char_length(btrim(county)) between 1 and 80),
  town text not null check (char_length(btrim(town)) between 1 and 120),
  area text not null default '' check (char_length(area) <= 120),
  website_url text check (website_url is null or website_url ~ '^https://'),
  contact_phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists neighborhood_places_search_idx
  on public.neighborhood_places (county, town, category) where status = 'approved';
alter table public.neighborhood_places enable row level security;
revoke all on public.neighborhood_places from public, anon, authenticated;
grant select (id, name, category, description, county, town, area, website_url, contact_phone, status, created_at)
  on public.neighborhood_places to anon, authenticated;
grant insert (submitted_by, name, category, description, county, town, area, website_url, contact_phone)
  on public.neighborhood_places to authenticated;
grant update (status) on public.neighborhood_places to authenticated;
create policy neighborhood_places_read_approved_or_admin on public.neighborhood_places
  for select to anon, authenticated using (status = 'approved' or private.is_platform_admin());
create policy neighborhood_places_submit on public.neighborhood_places
  for insert to authenticated with check (submitted_by = (select auth.uid()) and status = 'pending');
create policy neighborhood_places_admin_moderate on public.neighborhood_places
  for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());

create table if not exists public.neighborhood_notices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 120),
  body text not null check (char_length(btrim(body)) between 20 and 2000),
  county text not null check (char_length(btrim(county)) between 1 and 80),
  town text not null check (char_length(btrim(town)) between 1 and 120),
  event_date date,
  expires_at date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  check (expires_at is null or event_date is null or expires_at >= event_date)
);
create index if not exists neighborhood_notices_public_idx
  on public.neighborhood_notices (county, town, event_date) where status = 'approved';
alter table public.neighborhood_notices enable row level security;
revoke all on public.neighborhood_notices from public, anon, authenticated;
grant select (id, owner_id, title, body, county, town, event_date, expires_at, status, created_at)
  on public.neighborhood_notices to anon, authenticated;
grant insert (owner_id, title, body, county, town, event_date, expires_at)
  on public.neighborhood_notices to authenticated;
grant update (status) on public.neighborhood_notices to authenticated;
create policy neighborhood_notices_read_approved_or_owner_or_admin on public.neighborhood_notices
  for select to anon, authenticated using (status = 'approved' or owner_id = (select auth.uid()) or private.is_platform_admin());
create policy neighborhood_notices_submit on public.neighborhood_notices
  for insert to authenticated with check (owner_id = (select auth.uid()) and status = 'pending');
create policy neighborhood_notices_admin_moderate on public.neighborhood_notices
  for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());

create table if not exists public.property_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 120),
  category text not null check (category in (
    'caretaker', 'property_agent', 'cleaner', 'security', 'maintenance',
    'construction', 'moving', 'other'
  )),
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contract', 'casual')),
  description text not null check (char_length(btrim(description)) between 20 and 3000),
  county text not null check (char_length(btrim(county)) between 1 and 80),
  town text not null check (char_length(btrim(town)) between 1 and 120),
  pay_min numeric(12, 2) check (pay_min is null or pay_min >= 0),
  pay_max numeric(12, 2) check (pay_max is null or pay_max >= pay_min),
  status text not null default 'pending' check (status in ('pending', 'open', 'closed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_jobs_public_search_idx
  on public.property_jobs (county, category, created_at desc) where status = 'open';
alter table public.property_jobs enable row level security;
revoke all on public.property_jobs from public, anon, authenticated;
grant select (id, owner_id, title, category, employment_type, description, county, town, pay_min, pay_max, status, created_at)
  on public.property_jobs to anon, authenticated;
grant insert (owner_id, title, category, employment_type, description, county, town, pay_min, pay_max)
  on public.property_jobs to authenticated;
grant update (title, category, employment_type, description, county, town, pay_min, pay_max, status)
  on public.property_jobs to authenticated;
create policy property_jobs_read_open_or_owner_or_admin on public.property_jobs
  for select to anon, authenticated using (status = 'open' or owner_id = (select auth.uid()) or private.is_platform_admin());
create policy property_jobs_create_pending on public.property_jobs
  for insert to authenticated with check (owner_id = (select auth.uid()) and status = 'pending');
create policy property_jobs_owner_update on public.property_jobs
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy property_jobs_admin_update on public.property_jobs
  for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());

create or replace function private.protect_property_job_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not private.is_platform_admin() then
    if not (old.owner_id = auth.uid() and old.status = 'open' and new.status = 'closed') then
      raise exception 'Only administrators can approve or reject property job listings';
    end if;
  end if;
  if tg_op = 'UPDATE' and not private.is_platform_admin() and (
    new.title is distinct from old.title
    or new.category is distinct from old.category
    or new.employment_type is distinct from old.employment_type
    or new.description is distinct from old.description
    or new.county is distinct from old.county
    or new.town is distinct from old.town
    or new.pay_min is distinct from old.pay_min
    or new.pay_max is distinct from old.pay_max
  ) then
    new.status := 'pending';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.protect_property_job_status() from public, anon, authenticated;
create trigger property_job_status_guard before update on public.property_jobs
  for each row execute function private.protect_property_job_status();

create table if not exists public.property_job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.property_jobs(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null check (char_length(btrim(applicant_name)) between 2 and 120),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 32),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'shortlisted', 'declined')),
  created_at timestamptz not null default now(),
  unique (job_id, applicant_id)
);
alter table public.property_job_applications enable row level security;
revoke all on public.property_job_applications from public, anon, authenticated;
grant select (id, job_id, applicant_id, applicant_name, contact_phone, message, status, created_at) on public.property_job_applications to authenticated;
grant insert (job_id, applicant_id, applicant_name, contact_phone, message) on public.property_job_applications to authenticated;
grant update (status) on public.property_job_applications to authenticated;
create policy property_job_applications_read_participants on public.property_job_applications
  for select to authenticated using (
    applicant_id = (select auth.uid())
    or exists (select 1 from public.property_jobs j where j.id = job_id and j.owner_id = (select auth.uid()))
    or private.is_platform_admin()
  );
create policy property_job_applications_apply_open on public.property_job_applications
  for insert to authenticated with check (
    applicant_id = (select auth.uid())
    and exists (select 1 from public.property_jobs j where j.id = job_id and j.status = 'open' and j.owner_id <> (select auth.uid()))
  );
create policy property_job_applications_owner_update on public.property_job_applications
  for update to authenticated using (
    exists (select 1 from public.property_jobs j where j.id = job_id and j.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.property_jobs j where j.id = job_id and j.owner_id = (select auth.uid()))
  );

alter table public.rental_tenancies
  add column if not exists tenant_user_id uuid references auth.users(id) on delete set null;
grant select (tenant_user_id) on public.rental_tenancies to authenticated;
grant update (tenant_user_id) on public.rental_tenancies to authenticated;
drop policy if exists rental_tenancies_owner_access on public.rental_tenancies;
create policy rental_tenancies_owner_or_linked_tenant on public.rental_tenancies
  for all to authenticated
  using (
    (owner_id = (select auth.uid()) and exists (
      select 1 from public.rental_properties p
      where p.id = rental_tenancies.property_id and p.owner_id = (select auth.uid()) and p.listing_type = 'rent'
    ))
    or tenant_user_id = (select auth.uid())
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties p
      where p.id = rental_tenancies.property_id and p.owner_id = (select auth.uid()) and p.listing_type = 'rent'
    )
  );

create table if not exists public.tenant_maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  tenant_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 120),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'urgent')),
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'in_progress', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_maintenance_requests enable row level security;
revoke all on public.tenant_maintenance_requests from public, anon, authenticated;
grant select (id, tenancy_id, tenant_id, title, description, urgency, status, created_at, updated_at)
  on public.tenant_maintenance_requests to authenticated;
grant insert (tenancy_id, tenant_id, title, description, urgency) on public.tenant_maintenance_requests to authenticated;
grant update (status) on public.tenant_maintenance_requests to authenticated;
create policy tenant_maintenance_read_participants on public.tenant_maintenance_requests
  for select to authenticated using (
    tenant_id = (select auth.uid())
    or exists (select 1 from public.rental_tenancies t where t.id = tenancy_id and t.owner_id = (select auth.uid()))
  );
create policy tenant_maintenance_submit_linked on public.tenant_maintenance_requests
  for insert to authenticated with check (
    tenant_id = (select auth.uid())
    and exists (select 1 from public.rental_tenancies t where t.id = tenancy_id and t.tenant_user_id = (select auth.uid()) and t.status = 'active')
  );
create policy tenant_maintenance_owner_update on public.tenant_maintenance_requests
  for update to authenticated using (
    exists (select 1 from public.rental_tenancies t where t.id = tenancy_id and t.owner_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.rental_tenancies t where t.id = tenancy_id and t.owner_id = (select auth.uid()))
  );

notify pgrst, 'reload schema';

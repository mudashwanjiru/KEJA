create table if not exists public.keja_directory_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  department text not null check (department in (
    'marketplace', 'food', 'health', 'education', 'transport',
    'accommodation', 'agriculture', 'events', 'businesses'
  )),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  category text not null check (char_length(btrim(category)) between 2 and 80),
  description text not null check (char_length(btrim(description)) between 20 and 3000),
  county text not null check (char_length(btrim(county)) between 1 and 80),
  town text not null check (char_length(btrim(town)) between 1 and 120),
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 32),
  price numeric(12, 2) check (price is null or price >= 0),
  price_unit text not null default '' check (char_length(price_unit) <= 40),
  website_url text check (website_url is null or website_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keja_directory_public_search_idx
  on public.keja_directory_listings (department, county, town, created_at desc)
  where status = 'approved';
create index if not exists keja_directory_owner_idx
  on public.keja_directory_listings (owner_id, created_at desc);

alter table public.keja_directory_listings enable row level security;
revoke all on public.keja_directory_listings from public, anon, authenticated;

grant select (
  id, department, title, category, description, county, town,
  contact_name, contact_phone, price, price_unit, website_url, status, created_at
) on public.keja_directory_listings to anon, authenticated;
grant select (owner_id) on public.keja_directory_listings to authenticated;
grant insert (
  owner_id, department, title, category, description, county, town,
  contact_name, contact_phone, price, price_unit, website_url
) on public.keja_directory_listings to authenticated;
grant update (
  department, title, category, description, county, town, contact_name,
  contact_phone, price, price_unit, website_url
) on public.keja_directory_listings to authenticated;
grant update (status) on public.keja_directory_listings to authenticated;
grant delete on public.keja_directory_listings to authenticated;

drop policy if exists keja_directory_read_approved_owner_admin on public.keja_directory_listings;
create policy keja_directory_read_approved_owner_admin
  on public.keja_directory_listings for select to anon, authenticated
  using (
    status = 'approved'
    or owner_id = (select auth.uid())
    or private.is_platform_admin()
  );

drop policy if exists keja_directory_submit_self on public.keja_directory_listings;
create policy keja_directory_submit_self
  on public.keja_directory_listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');

drop policy if exists keja_directory_update_self on public.keja_directory_listings;
create policy keja_directory_update_self
  on public.keja_directory_listings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists keja_directory_delete_self on public.keja_directory_listings;
create policy keja_directory_delete_self
  on public.keja_directory_listings for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists keja_directory_admin_moderate on public.keja_directory_listings;
create policy keja_directory_admin_moderate
  on public.keja_directory_listings for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create or replace function private.protect_keja_directory_listing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_platform_admin() then
    if tg_op = 'INSERT' and new.status <> 'pending' then
      raise exception 'New directory listings must be submitted for review';
    end if;
    if tg_op = 'UPDATE' then
      if new.status is distinct from old.status then
        raise exception 'Only an administrator can moderate directory listings';
      end if;
      if new.department is distinct from old.department
        or new.title is distinct from old.title
        or new.category is distinct from old.category
        or new.description is distinct from old.description
        or new.county is distinct from old.county
        or new.town is distinct from old.town
        or new.contact_name is distinct from old.contact_name
        or new.contact_phone is distinct from old.contact_phone
        or new.price is distinct from old.price
        or new.price_unit is distinct from old.price_unit
        or new.website_url is distinct from old.website_url
      then
        new.status := 'pending';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_keja_directory_listing() from public, anon, authenticated;
drop trigger if exists keja_directory_listing_guard on public.keja_directory_listings;
create trigger keja_directory_listing_guard
  before insert or update on public.keja_directory_listings
  for each row execute function private.protect_keja_directory_listing();

notify pgrst, 'reload schema';

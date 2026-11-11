alter table public.rental_properties
  add column if not exists nightly_price numeric(12, 2),
  add column if not exists land_size_acres numeric(12, 3),
  add column if not exists commercial_use text,
  add column if not exists booking_policy text not null default 'Request to book; the host confirms availability.',
  add column if not exists cancellation_policy text not null default 'Agree cancellation terms with the host before booking.',
  add column if not exists minimum_stay_nights smallint not null default 1,
  add column if not exists maximum_stay_nights smallint;

alter table public.rental_properties
  drop constraint if exists rental_properties_listing_type_check,
  add constraint rental_properties_listing_type_check
    check (listing_type in ('rent', 'sale', 'short_stay')),
  drop constraint if exists rental_properties_property_type_check,
  add constraint rental_properties_property_type_check
    check (property_type in ('apartment', 'house', 'bedsitter', 'studio', 'townhouse', 'land', 'commercial', 'short_stay', 'other')),
  drop constraint if exists rental_properties_expanded_price_check,
  add constraint rental_properties_expanded_price_check check (
    (listing_type = 'rent' and monthly_rent is not null and sale_price is null and nightly_price is null)
    or (listing_type = 'sale' and sale_price is not null and monthly_rent is null and nightly_price is null)
    or (listing_type = 'short_stay' and nightly_price > 0 and monthly_rent is null and sale_price is null)
  ),
  drop constraint if exists rental_properties_land_size_check,
  add constraint rental_properties_land_size_check
    check (land_size_acres is null or land_size_acres > 0),
  drop constraint if exists rental_properties_commercial_use_check,
  add constraint rental_properties_commercial_use_check
    check (commercial_use is null or char_length(commercial_use) <= 120),
  drop constraint if exists rental_properties_land_requires_size_check,
  add constraint rental_properties_land_requires_size_check
    check (property_type <> 'land' or land_size_acres is not null),
  drop constraint if exists rental_properties_commercial_requires_use_check,
  add constraint rental_properties_commercial_requires_use_check
    check (property_type <> 'commercial' or nullif(btrim(commercial_use), '') is not null),
  drop constraint if exists rental_properties_stay_nights_check,
  add constraint rental_properties_stay_nights_check
    check (
      minimum_stay_nights between 1 and 365
      and (maximum_stay_nights is null or maximum_stay_nights between minimum_stay_nights and 365)
    ),
  drop constraint if exists rental_properties_booking_policy_check,
  add constraint rental_properties_booking_policy_check
    check (char_length(booking_policy) <= 2000 and char_length(cancellation_policy) <= 2000);

alter table public.rental_properties
  drop constraint if exists rental_properties_price_by_listing_type;

alter table public.rental_saved_searches
  drop constraint if exists rental_saved_searches_listing_type_check,
  add constraint rental_saved_searches_listing_type_check
    check (listing_type in ('rent', 'sale', 'short_stay'));

create or replace function private.notify_saved_search_matches()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.verification_status <> 'verified'
    or new.listing_status not in ('available', 'available_soon')
    or (
      tg_op = 'UPDATE'
      and old.verification_status = 'verified'
      and old.listing_status in ('available', 'available_soon')
    )
  then
    return new;
  end if;

  insert into public.platform_notifications (user_id, kind, body, property_id)
  select distinct s.user_id, 'saved_search_match', 'A new verified property matches a saved search.', new.id
  from public.rental_saved_searches s
  where s.notify_new_listings
    and s.listing_type = new.listing_type
    and (s.location = '' or new.location_label ilike '%' || s.location || '%')
    and (
      s.max_price is null
      or (new.listing_type = 'rent' and new.monthly_rent <= s.max_price)
      or (new.listing_type = 'sale' and new.sale_price <= s.max_price)
      or (new.listing_type = 'short_stay' and new.nightly_price <= s.max_price)
    )
    and (s.min_bedrooms is null or new.bedrooms >= s.min_bedrooms)
    and not exists (
      select 1
      from unnest(s.service_categories) as required_service(category)
      where not exists (
        select 1 from public.property_nearby_services service
        where service.property_id = new.id
          and service.category = required_service.category
          and service.distance_m <= s.service_radius_m
      )
    )
    and not exists (
      select 1 from public.platform_notifications n
      where n.user_id = s.user_id
        and n.kind = 'saved_search_match'
        and n.property_id = new.id
    );

  return new;
end;
$$;

grant select (nightly_price, land_size_acres, commercial_use, booking_policy, cancellation_policy, minimum_stay_nights, maximum_stay_nights)
  on public.rental_properties to anon, authenticated;
grant insert (nightly_price, land_size_acres, commercial_use, booking_policy, cancellation_policy, minimum_stay_nights, maximum_stay_nights)
  on public.rental_properties to authenticated;
grant update (nightly_price, land_size_acres, commercial_use, booking_policy, cancellation_policy, minimum_stay_nights, maximum_stay_nights)
  on public.rental_properties to authenticated;

create table if not exists public.short_stay_bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  guest_count smallint not null default 1 check (guest_count between 1 and 30),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint short_stay_booking_dates_check check (check_out > check_in)
);

create index if not exists short_stay_bookings_property_dates_idx
  on public.short_stay_bookings (property_id, check_in, check_out)
  where status in ('requested', 'confirmed');
create index if not exists short_stay_bookings_requester_idx
  on public.short_stay_bookings (requester_id, created_at desc);

alter table public.short_stay_bookings enable row level security;
revoke all on public.short_stay_bookings from public, anon, authenticated;
grant select, insert on public.short_stay_bookings to authenticated;
grant update (status) on public.short_stay_bookings to authenticated;

drop policy if exists short_stay_bookings_read_participants on public.short_stay_bookings;
create policy short_stay_bookings_read_participants
  on public.short_stay_bookings for select to authenticated
  using (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.rental_properties
      where rental_properties.id = short_stay_bookings.property_id
        and rental_properties.owner_id = (select auth.uid())
    )
  );

drop policy if exists short_stay_bookings_request_verified_stay on public.short_stay_bookings;
create policy short_stay_bookings_request_verified_stay
  on public.short_stay_bookings for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and check_in >= current_date
    and check_out > check_in
    and exists (
      select 1 from public.rental_properties
      where rental_properties.id = short_stay_bookings.property_id
        and rental_properties.listing_type = 'short_stay'
        and rental_properties.listing_status in ('available', 'available_soon')
        and rental_properties.verification_status = 'verified'
        and rental_properties.owner_id <> (select auth.uid())
        and (
          rental_properties.maximum_stay_nights is null
          or check_out - check_in <= rental_properties.maximum_stay_nights
        )
        and check_out - check_in >= rental_properties.minimum_stay_nights
    )
  );

drop policy if exists short_stay_bookings_update_participant on public.short_stay_bookings;
create policy short_stay_bookings_update_participant
  on public.short_stay_bookings for update to authenticated
  using (
    (
      requester_id = (select auth.uid())
      and status in ('requested', 'confirmed')
    )
    or (
      status in ('requested', 'confirmed')
      and exists (
        select 1 from public.rental_properties
        where rental_properties.id = short_stay_bookings.property_id
          and rental_properties.owner_id = (select auth.uid())
      )
    )
  )
  with check (
    (
      requester_id = (select auth.uid())
      and status = 'cancelled'
    )
    or (
      status in ('requested', 'confirmed', 'declined', 'completed', 'cancelled')
      and exists (
        select 1 from public.rental_properties
        where rental_properties.id = short_stay_bookings.property_id
          and rental_properties.owner_id = (select auth.uid())
      )
    )
  );

create or replace function private.prevent_short_stay_booking_overlap()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if auth.uid() = old.requester_id then
      if old.status not in ('requested', 'confirmed') or new.status <> 'cancelled' then
        raise exception 'Guests may only cancel requested or confirmed stays';
      end if;
    elsif exists (
      select 1 from public.rental_properties
      where id = new.property_id and owner_id = auth.uid()
    ) then
      if not (
        (old.status = 'requested' and new.status in ('confirmed', 'declined', 'cancelled'))
        or (old.status = 'confirmed' and new.status in ('completed', 'cancelled'))
      ) then
        raise exception 'Invalid host booking status change';
      end if;
    else
      raise exception 'Only the guest or host may update a stay request';
    end if;
  end if;

  if new.status = 'confirmed' then
    perform 1 from public.rental_properties
    where id = new.property_id
    for update;

    if exists (
      select 1 from public.short_stay_bookings existing
      where existing.property_id = new.property_id
        and existing.id <> new.id
        and existing.status = 'confirmed'
        and existing.check_in < new.check_out
        and existing.check_out > new.check_in
    ) then
      raise exception 'Those dates overlap an existing confirmed booking';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prevent_short_stay_booking_overlap() from public, anon, authenticated;
drop trigger if exists short_stay_booking_overlap_guard on public.short_stay_bookings;
create trigger short_stay_booking_overlap_guard
  before insert or update on public.short_stay_bookings
  for each row execute function private.prevent_short_stay_booking_overlap();

create table if not exists public.rental_tenancies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_name text not null check (char_length(btrim(tenant_name)) between 2 and 120),
  tenant_phone text not null check (char_length(btrim(tenant_phone)) between 7 and 32),
  start_date date not null,
  end_date date,
  monthly_rent numeric(12, 2) not null check (monthly_rent > 0),
  rent_due_day smallint not null default 1 check (rent_due_day between 1 and 28),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  constraint rental_tenancy_dates_check check (end_date is null or end_date >= start_date)
);

create index if not exists rental_tenancies_owner_idx
  on public.rental_tenancies (owner_id, status, start_date);
alter table public.rental_tenancies enable row level security;
revoke all on public.rental_tenancies from public, anon, authenticated;
grant select, insert, update on public.rental_tenancies to authenticated;

drop policy if exists rental_tenancies_owner_access on public.rental_tenancies;
create policy rental_tenancies_owner_access
  on public.rental_tenancies for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties
      where rental_properties.id = rental_tenancies.property_id
        and rental_properties.owner_id = (select auth.uid())
        and rental_properties.listing_type = 'rent'
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_properties
      where rental_properties.id = rental_tenancies.property_id
        and rental_properties.owner_id = (select auth.uid())
        and rental_properties.listing_type = 'rent'
    )
  );

create table if not exists public.rental_payment_records (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.rental_tenancies(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'due' check (status in ('due', 'paid', 'late', 'waived')),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (tenancy_id, period_start)
);

create index if not exists rental_payment_records_owner_due_idx
  on public.rental_payment_records (owner_id, due_date, status);
alter table public.rental_payment_records enable row level security;
revoke all on public.rental_payment_records from public, anon, authenticated;
grant select, insert, update on public.rental_payment_records to authenticated;

drop policy if exists rental_payment_records_owner_access on public.rental_payment_records;
create policy rental_payment_records_owner_access
  on public.rental_payment_records for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_tenancies
      where rental_tenancies.id = rental_payment_records.tenancy_id
        and rental_tenancies.owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.rental_tenancies
      where rental_tenancies.id = rental_payment_records.tenancy_id
        and rental_tenancies.owner_id = (select auth.uid())
    )
  );

create table if not exists public.finance_partners (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  product_type text not null check (product_type in ('mortgage', 'construction', 'asset_finance', 'other')),
  description text not null check (char_length(btrim(description)) between 20 and 2000),
  counties text[] not null default '{}',
  website_url text not null check (website_url ~ '^https://'),
  contact_phone text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'suspended')),
  created_at timestamptz not null default now()
);

alter table public.finance_partners enable row level security;
revoke all on public.finance_partners from public, anon, authenticated;
grant select (id, business_name, product_type, description, counties, website_url, contact_phone, verification_status)
  on public.finance_partners to anon, authenticated;
grant insert (business_name, product_type, description, counties, website_url, contact_phone)
  on public.finance_partners to authenticated;
grant update (verification_status) on public.finance_partners to authenticated;

drop policy if exists finance_partners_read_verified_admin on public.finance_partners;
create policy finance_partners_read_verified_admin
  on public.finance_partners for select to anon, authenticated
  using (verification_status = 'verified' or private.is_platform_admin());
drop policy if exists finance_partners_admin_insert on public.finance_partners;
create policy finance_partners_admin_insert
  on public.finance_partners for insert to authenticated
  with check (private.is_platform_admin());
drop policy if exists finance_partners_admin_update on public.finance_partners;
create policy finance_partners_admin_update
  on public.finance_partners for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create table if not exists public.service_provider_reviews (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 5 and 1500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists service_provider_reviews_public_idx
  on public.service_provider_reviews (provider_id, created_at desc)
  where status = 'approved';
alter table public.service_provider_reviews enable row level security;
revoke all on public.service_provider_reviews from public, anon, authenticated;
grant select (id, service_request_id, provider_id, author_id, rating, body, status, created_at)
  on public.service_provider_reviews to authenticated;
grant select (id, rating, body, created_at)
  on public.service_provider_reviews to anon, authenticated;
grant insert (service_request_id, provider_id, author_id, rating, body)
  on public.service_provider_reviews to authenticated;
grant update (status) on public.service_provider_reviews to authenticated;

drop policy if exists service_provider_reviews_read_public_or_participant on public.service_provider_reviews;
create policy service_provider_reviews_read_public_or_participant
  on public.service_provider_reviews for select to anon, authenticated
  using (
    status = 'approved'
    or author_id = (select auth.uid())
    or private.is_platform_admin()
    or exists (
      select 1 from public.service_providers
      where service_providers.id = service_provider_reviews.provider_id
        and service_providers.user_id = (select auth.uid())
    )
  );

drop policy if exists service_provider_reviews_create_completed_request on public.service_provider_reviews;
create policy service_provider_reviews_create_completed_request
  on public.service_provider_reviews for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.service_requests
      where service_requests.id = service_provider_reviews.service_request_id
        and service_requests.provider_id = service_provider_reviews.provider_id
        and service_requests.requester_id = (select auth.uid())
        and service_requests.status = 'completed'
    )
  );

drop policy if exists service_provider_reviews_admin_update on public.service_provider_reviews;
create policy service_provider_reviews_admin_update
  on public.service_provider_reviews for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

create or replace function private.protect_service_provider_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and not private.is_platform_admin() then
    raise exception 'Only administrators can moderate provider reviews';
  end if;
  if tg_op = 'INSERT' and new.status <> 'pending' then
    raise exception 'New provider reviews require moderation';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_service_provider_review() from public, anon, authenticated;
drop trigger if exists service_provider_review_guard on public.service_provider_reviews;
create trigger service_provider_review_guard
  before insert or update on public.service_provider_reviews
  for each row execute function private.protect_service_provider_review();

notify pgrst, 'reload schema';

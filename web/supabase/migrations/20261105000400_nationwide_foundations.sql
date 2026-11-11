create table if not exists public.keja_ward_reference (
  id bigint generated always as identity primary key,
  county text not null,
  sub_county text not null,
  ward text not null,
  source_url text not null check (source_url ~ '^https://'),
  source_version text not null check (char_length(btrim(source_version)) between 1 and 80),
  imported_at timestamptz not null default now(),
  unique (county, sub_county, ward),
  check (char_length(btrim(county)) between 1 and 80),
  check (char_length(btrim(sub_county)) between 1 and 120),
  check (char_length(btrim(ward)) between 1 and 120)
);

alter table public.keja_ward_reference enable row level security;
revoke all on public.keja_ward_reference from public, anon, authenticated;
grant select (county, sub_county, ward, source_url, source_version)
  on public.keja_ward_reference to anon, authenticated;

drop policy if exists keja_ward_reference_public_read on public.keja_ward_reference;
create policy keja_ward_reference_public_read on public.keja_ward_reference
  for select to anon, authenticated using (true);

with known_counties(county) as (select unnest(array[
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa',
  'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi',
  'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu',
  'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa',
  'Murang''a', 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua',
  'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
]::text[])), matched_locations as (
  select p.id, min(c.county) as county
  from public.rental_properties p
  cross join known_counties c
  where p.county is null
    and exists (
      select 1 from regexp_split_to_table(coalesce(p.location_label, ''), '[,;|]') token
      where lower(btrim(token)) = lower(c.county)
    )
  group by p.id
  having count(distinct c.county) = 1
)
update public.rental_properties p
set county = matched.county
from matched_locations matched
where p.id = matched.id;

with known_counties(county) as (select unnest(array[
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa',
  'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi',
  'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu',
  'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa',
  'Murang''a', 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua',
  'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
]::text[])), matched_locations as (
  select s.id, min(c.county) as county
  from public.stalls s
  cross join known_counties c
  where s.county is null
    and exists (
      select 1 from regexp_split_to_table(coalesce(s.location_label, ''), '[,;|]') token
      where lower(btrim(token)) = lower(c.county)
    )
  group by s.id
  having count(distinct c.county) = 1
)
update public.stalls s
set county = matched.county
from matched_locations matched
where s.id = matched.id;

create or replace function public.import_keja_ward_reference(
  p_source_url text,
  p_source_version text,
  p_wards jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  imported_count integer;
begin
  if not private.is_platform_admin() then
    raise exception 'Administrator access is required to import ward data';
  end if;
  if p_source_url is null or p_source_url !~ '^https://'
    or p_source_version is null or char_length(btrim(p_source_version)) not between 1 and 80
  then
    raise exception 'Provide an HTTPS source URL and dataset version';
  end if;
  if p_wards is null or jsonb_typeof(p_wards) <> 'array' then
    raise exception 'Ward data must be a JSON array';
  end if;
  if jsonb_array_length(p_wards) not between 1 and 20000 then
    raise exception 'Provide between 1 and 20,000 ward rows';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_wards) as row_data(county text, sub_county text, ward text)
    where btrim(coalesce(row_data.county, '')) not in (
      'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu',
      'Garissa', 'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho',
      'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale',
      'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit',
      'Meru', 'Migori', 'Mombasa', 'Murang''a', 'Nairobi', 'Nakuru', 'Nandi',
      'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya',
      'Taita-Taveta', 'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana',
      'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot'
    )
      or char_length(btrim(coalesce(row_data.sub_county, ''))) not between 1 and 120
      or char_length(btrim(coalesce(row_data.ward, ''))) not between 1 and 120
  ) then
    raise exception 'Each row must contain a valid Kenyan county, sub-county, and ward';
  end if;

  insert into public.keja_ward_reference (county, sub_county, ward, source_url, source_version)
  select distinct on (btrim(row_data.county), btrim(row_data.sub_county), btrim(row_data.ward))
    btrim(row_data.county), btrim(row_data.sub_county), btrim(row_data.ward),
    btrim(p_source_url), btrim(p_source_version)
  from jsonb_to_recordset(p_wards) as row_data(county text, sub_county text, ward text)
  order by btrim(row_data.county), btrim(row_data.sub_county), btrim(row_data.ward)
  on conflict (county, sub_county, ward) do update
    set source_url = excluded.source_url,
        source_version = excluded.source_version,
        imported_at = now();

  get diagnostics imported_count = row_count;

  with matched_wards as (
    select p.id, min(reference.ward) as ward
    from public.rental_properties p
    join public.keja_ward_reference reference on reference.county = p.county
    where p.ward is null
      and exists (
        select 1
        from regexp_split_to_table(coalesce(p.location_label, ''), '[,;|]') token
        where lower(btrim(token)) = lower(reference.ward)
      )
    group by p.id
    having count(distinct reference.ward) = 1
  )
  update public.rental_properties p
  set ward = matched.ward
  from matched_wards matched
  where p.id = matched.id;

  with matched_wards as (
    select s.id, min(reference.ward) as ward
    from public.stalls s
    join public.keja_ward_reference reference on reference.county = s.county
    where s.ward is null
      and exists (
        select 1
        from regexp_split_to_table(coalesce(s.location_label, ''), '[,;|]') token
        where lower(btrim(token)) = lower(reference.ward)
      )
    group by s.id
    having count(distinct reference.ward) = 1
  )
  update public.stalls s
  set ward = matched.ward
  from matched_wards matched
  where s.id = matched.id;

  return imported_count;
end;
$$;

revoke all on function public.import_keja_ward_reference(text, text, jsonb) from public, anon;
grant execute on function public.import_keja_ward_reference(text, text, jsonb) to authenticated;

create or replace function public.get_keja_county_coverage()
returns table (
  county text,
  home_listings bigint,
  commercial_spaces bigint,
  verified_services bigint,
  open_jobs bigint,
  directory_listings bigint,
  ward_tagged_listings bigint,
  saved_searches bigint,
  new_listings_90d bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Administrator access is required to view county coverage';
  end if;

  return query
  with county_names(county_name) as (values
    ('Baringo'), ('Bomet'), ('Bungoma'), ('Busia'), ('Elgeyo-Marakwet'),
    ('Embu'), ('Garissa'), ('Homa Bay'), ('Isiolo'), ('Kajiado'), ('Kakamega'),
    ('Kericho'), ('Kiambu'), ('Kilifi'), ('Kirinyaga'), ('Kisii'), ('Kisumu'),
    ('Kitui'), ('Kwale'), ('Laikipia'), ('Lamu'), ('Machakos'), ('Makueni'),
    ('Mandera'), ('Marsabit'), ('Meru'), ('Migori'), ('Mombasa'), ('Murang''a'),
    ('Nairobi'), ('Nakuru'), ('Nandi'), ('Narok'), ('Nyamira'), ('Nyandarua'),
    ('Nyeri'), ('Samburu'), ('Siaya'), ('Taita-Taveta'), ('Tana River'),
    ('Tharaka-Nithi'), ('Trans Nzoia'), ('Turkana'), ('Uasin Gishu'), ('Vihiga'),
    ('Wajir'), ('West Pokot')
  )
  select
    c.county_name,
    (select count(*) from public.rental_properties p
      where p.county = c.county_name and p.verification_status = 'verified'
        and p.listing_status in ('available', 'available_soon')),
    (select count(*) from public.stalls s
      where s.county = c.county_name and s.review_status = 'approved' and s.status = 'vacant'),
    (select count(*) from public.service_providers sp
      where sp.county = c.county_name and sp.verification_status = 'verified'),
    (select count(*) from public.property_jobs j
      where j.county = c.county_name and j.status = 'open'),
    (select count(*) from public.keja_directory_listings d
      where d.county = c.county_name and d.status = 'approved'),
    (select count(*) from public.rental_properties p
      where p.county = c.county_name and p.ward is not null
        and p.verification_status = 'verified' and p.listing_status in ('available', 'available_soon'))
      + (select count(*) from public.stalls s
        where s.county = c.county_name and s.ward is not null
          and s.review_status = 'approved' and s.status = 'vacant'),
    (select count(*) from public.rental_saved_searches ss
      where ss.location ilike '%' || c.county_name || '%'),
    (select count(*) from public.rental_properties p
      where p.county = c.county_name and p.created_at >= now() - interval '90 days'
        and p.verification_status = 'verified' and p.listing_status in ('available', 'available_soon'))
      + (select count(*) from public.stalls s
        where s.county = c.county_name and s.created_at >= now() - interval '90 days'
          and s.review_status = 'approved' and s.status = 'vacant')
      + (select count(*) from public.service_providers sp
        where sp.county = c.county_name and sp.created_at >= now() - interval '90 days'
          and sp.verification_status = 'verified')
      + (select count(*) from public.property_jobs j
        where j.county = c.county_name and j.created_at >= now() - interval '90 days' and j.status = 'open')
      + (select count(*) from public.keja_directory_listings d
        where d.county = c.county_name and d.created_at >= now() - interval '90 days' and d.status = 'approved')
  from county_names c
  order by c.county_name;
end;
$$;

revoke all on function public.get_keja_county_coverage() from public, anon;
grant execute on function public.get_keja_county_coverage() to authenticated;

create table if not exists public.keja_directory_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.keja_directory_listings(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 5 and 2000),
  requested_date date,
  status text not null default 'pending'
    check (status in ('pending', 'responded', 'accepted', 'declined', 'completed', 'cancelled')),
  provider_response text not null default '' check (char_length(provider_response) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists keja_directory_requests_listing_idx
  on public.keja_directory_requests (listing_id, created_at desc);
create index if not exists keja_directory_requests_requester_idx
  on public.keja_directory_requests (requester_id, created_at desc);

alter table public.keja_directory_requests enable row level security;
revoke all on public.keja_directory_requests from public, anon, authenticated;
grant select, insert on public.keja_directory_requests to authenticated;
grant update (status, provider_response) on public.keja_directory_requests to authenticated;

drop policy if exists keja_directory_requests_read_participants on public.keja_directory_requests;
create policy keja_directory_requests_read_participants on public.keja_directory_requests
  for select to authenticated using (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.keja_directory_listings listing
      where listing.id = public.keja_directory_requests.listing_id
        and listing.owner_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

drop policy if exists keja_directory_requests_create on public.keja_directory_requests;
create policy keja_directory_requests_create on public.keja_directory_requests
  for insert to authenticated with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.keja_directory_listings listing
      where listing.id = public.keja_directory_requests.listing_id and listing.status = 'approved'
        and listing.owner_id <> (select auth.uid())
        and listing.department not in ('marketplace', 'food', 'accommodation')
    )
  );

drop policy if exists keja_directory_requests_update_participants on public.keja_directory_requests;
create policy keja_directory_requests_update_participants on public.keja_directory_requests
  for update to authenticated using (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.keja_directory_listings listing
      where listing.id = public.keja_directory_requests.listing_id
        and listing.owner_id = (select auth.uid())
    )
    or private.is_platform_admin()
  ) with check (
    requester_id = (select auth.uid())
    or exists (
      select 1 from public.keja_directory_listings listing
      where listing.id = public.keja_directory_requests.listing_id
        and listing.owner_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );

create or replace function private.protect_keja_directory_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  listing_owner uuid;
begin
  select owner_id into listing_owner
  from public.keja_directory_listings where id = new.listing_id;

  if tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id
      or new.requester_id is distinct from old.requester_id
      or new.message is distinct from old.message
      or new.requested_date is distinct from old.requested_date
    then
      raise exception 'Directory requests cannot be edited after submission';
    end if;
    if auth.uid() = old.requester_id then
      if new.status <> 'cancelled' or old.status <> 'pending'
        or new.provider_response is distinct from old.provider_response
      then
        raise exception 'Customers can only cancel pending requests';
      end if;
    elsif auth.uid() = listing_owner then
      if new.status not in ('responded', 'accepted', 'declined', 'completed')
        or old.status in ('cancelled', 'declined', 'completed')
      then
        raise exception 'The provider cannot make this request transition';
      end if;
      if (old.status = 'pending' and new.status not in ('responded', 'declined'))
        or (old.status = 'responded' and new.status not in ('responded', 'accepted', 'declined'))
        or (old.status = 'accepted' and new.status not in ('accepted', 'completed', 'declined'))
      then
        raise exception 'The provider cannot make this request transition';
      end if;
    elsif not private.is_platform_admin() then
      raise exception 'Only the customer, listing provider, or administrator can update this request';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_keja_directory_request() from public, anon, authenticated;
drop trigger if exists keja_directory_request_guard on public.keja_directory_requests;
create trigger keja_directory_request_guard
  before insert or update on public.keja_directory_requests
  for each row execute function private.protect_keja_directory_request();

create or replace function private.notify_keja_directory_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  listing_owner uuid;
  listing_title text;
begin
  select owner_id, title into listing_owner, listing_title
  from public.keja_directory_listings where id = new.listing_id;

  if tg_op = 'INSERT' then
    insert into public.platform_notifications (user_id, kind, body)
    values (listing_owner, 'directory_request', 'A new request was sent for ' || listing_title || '.');
  elsif new.status is distinct from old.status
    or new.provider_response is distinct from old.provider_response
  then
    if auth.uid() = listing_owner then
      insert into public.platform_notifications (user_id, kind, body)
      values (new.requester_id, 'directory_request_update', 'The provider updated your request for ' || listing_title || '.');
    elsif auth.uid() = new.requester_id then
      insert into public.platform_notifications (user_id, kind, body)
      values (listing_owner, 'directory_request_update', 'A customer updated a request for ' || listing_title || '.');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_keja_directory_request() from public, anon, authenticated;
drop trigger if exists keja_directory_request_notification on public.keja_directory_requests;
create trigger keja_directory_request_notification
  after insert or update on public.keja_directory_requests
  for each row execute function private.notify_keja_directory_request();

create table if not exists public.keja_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  consent_at timestamptz,
  consent_version text,
  updated_at timestamptz not null default now(),
  check (
    (sms_enabled or whatsapp_enabled)
    = (phone_e164 is not null and phone_verified_at is not null
      and consent_at is not null and consent_version is not null)
  )
);

alter table public.keja_notification_preferences enable row level security;
revoke all on public.keja_notification_preferences from public, anon, authenticated;
grant select on public.keja_notification_preferences to authenticated;
grant insert (user_id, sms_enabled, whatsapp_enabled, consent_at, consent_version)
  on public.keja_notification_preferences to authenticated;
grant update (sms_enabled, whatsapp_enabled, consent_at, consent_version)
  on public.keja_notification_preferences to authenticated;

drop policy if exists keja_notification_preferences_self on public.keja_notification_preferences;
create policy keja_notification_preferences_self on public.keja_notification_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.keja_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.platform_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, channel)
);

create index if not exists keja_notification_deliveries_due_idx
  on public.keja_notification_deliveries (next_attempt_at, created_at)
  where status = 'pending';

alter table public.keja_notification_deliveries enable row level security;
revoke all on public.keja_notification_deliveries from public, anon, authenticated;

create or replace function private.enqueue_keja_external_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.keja_notification_deliveries (notification_id, user_id, channel)
  select new.id, preferences.user_id, channel_name
  from public.keja_notification_preferences preferences
  cross join lateral (
    values ('sms', preferences.sms_enabled), ('whatsapp', preferences.whatsapp_enabled)
  ) as enabled_channels(channel_name, is_enabled)
  where preferences.user_id = new.user_id and enabled_channels.is_enabled
  on conflict (notification_id, channel) do nothing;
  return new;
end;
$$;

revoke all on function private.enqueue_keja_external_notifications() from public, anon, authenticated;
drop trigger if exists keja_notification_external_delivery on public.platform_notifications;
create trigger keja_notification_external_delivery
  after insert on public.platform_notifications
  for each row execute function private.enqueue_keja_external_notifications();

create or replace function public.claim_keja_notification_deliveries(p_limit integer default 25)
returns table (
  id uuid,
  user_id uuid,
  channel text,
  notification_id uuid,
  body text,
  attempt_count smallint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role access is required';
  end if;

  update public.keja_notification_deliveries delivery
  set status = 'failed', last_error_code = 'delivery_timeout'
  where delivery.status = 'processing'
    and delivery.claimed_at < now() - interval '15 minutes'
    and delivery.attempt_count >= 5;

  return query
  with candidates as (
    select delivery.id
    from public.keja_notification_deliveries delivery
    where (
        (delivery.status = 'pending' and delivery.next_attempt_at <= now())
        or (delivery.status = 'processing' and delivery.claimed_at < now() - interval '5 minutes')
      )
      and delivery.attempt_count < 5
    order by delivery.next_attempt_at, delivery.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 50))
  ), claimed as (
    update public.keja_notification_deliveries delivery
    set status = 'processing', attempt_count = delivery.attempt_count + 1, claimed_at = now()
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.user_id, delivery.channel, delivery.notification_id, delivery.attempt_count
  )
  select claimed.id, claimed.user_id, claimed.channel, claimed.notification_id,
    notification.body, claimed.attempt_count
  from claimed
  join public.platform_notifications notification on notification.id = claimed.notification_id;
end;
$$;

revoke all on function public.claim_keja_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_keja_notification_deliveries(integer) to service_role;

create table if not exists public.keja_ai_usage_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count between 0 and 11)
);
alter table public.keja_ai_usage_windows enable row level security;
revoke all on public.keja_ai_usage_windows from public, anon, authenticated;

create or replace function public.consume_keja_ai_request()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  requests_in_window integer;
begin
  if current_user_id is null then
    raise exception 'Sign in to use the KEJA assistant';
  end if;

  insert into public.keja_ai_usage_windows (user_id, window_started_at, request_count)
  values (current_user_id, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.keja_ai_usage_windows.window_started_at <= now() - interval '1 minute' then now()
          else public.keja_ai_usage_windows.window_started_at
        end,
        request_count = case
          when public.keja_ai_usage_windows.window_started_at <= now() - interval '1 minute' then 1
          else least(public.keja_ai_usage_windows.request_count + 1, 11)
        end
  returning request_count into requests_in_window;

  return requests_in_window <= 10;
end;
$$;

revoke all on function public.consume_keja_ai_request() from public, anon;
grant execute on function public.consume_keja_ai_request() to authenticated;

create table if not exists public.keja_phone_verification_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count between 0 and 4)
);
alter table public.keja_phone_verification_windows enable row level security;
revoke all on public.keja_phone_verification_windows from public, anon, authenticated;

create or replace function public.consume_keja_phone_verification_request()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  requests_in_window integer;
begin
  if current_user_id is null then
    raise exception 'Sign in to verify your phone number';
  end if;

  insert into public.keja_phone_verification_windows (user_id, window_started_at, request_count)
  values (current_user_id, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.keja_phone_verification_windows.window_started_at <= now() - interval '1 hour' then now()
          else public.keja_phone_verification_windows.window_started_at
        end,
        request_count = case
          when public.keja_phone_verification_windows.window_started_at <= now() - interval '1 hour' then 1
          else least(public.keja_phone_verification_windows.request_count + 1, 4)
        end
  returning request_count into requests_in_window;

  return requests_in_window <= 3;
end;
$$;

revoke all on function public.consume_keja_phone_verification_request() from public, anon;
grant execute on function public.consume_keja_phone_verification_request() to authenticated;

notify pgrst, 'reload schema';

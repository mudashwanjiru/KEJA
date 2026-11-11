create table if not exists public.rental_saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_text text not null default '' check (char_length(search_text) <= 300),
  location text not null default '' check (char_length(location) <= 120),
  listing_type text not null check (listing_type in ('rent', 'sale')),
  max_price numeric(12, 2) check (max_price is null or max_price > 0),
  min_bedrooms smallint check (min_bedrooms is null or min_bedrooms between 0 and 20),
  service_categories text[] not null default '{}'
    check (service_categories <@ array[
      'hospital', 'school', 'university', 'supermarket', 'pharmacy', 'bank',
      'atm', 'petrol_station', 'matatu_stage', 'bus_stop', 'railway_station',
      'restaurant', 'cafe', 'gym', 'mosque', 'church', 'police_station',
      'fire_station', 'park', 'shop', 'mpesa_agent', 'other'
    ]::text[]),
  service_radius_m integer not null default 2000 check (service_radius_m between 500 and 5000),
  notify_new_listings boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists rental_saved_searches_alerts_idx
  on public.rental_saved_searches (listing_type, user_id)
  where notify_new_listings;

alter table public.rental_saved_searches enable row level security;
revoke all on public.rental_saved_searches from public, anon, authenticated;
grant select, insert, delete on public.rental_saved_searches to authenticated;

drop policy if exists rental_saved_searches_read_self on public.rental_saved_searches;
create policy rental_saved_searches_read_self
  on public.rental_saved_searches for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rental_saved_searches_insert_self on public.rental_saved_searches;
create policy rental_saved_searches_insert_self
  on public.rental_saved_searches for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists rental_saved_searches_delete_self on public.rental_saved_searches;
create policy rental_saved_searches_delete_self
  on public.rental_saved_searches for delete to authenticated
  using (user_id = (select auth.uid()));

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

revoke all on function private.notify_saved_search_matches() from public, anon, authenticated;
drop trigger if exists rental_saved_search_match_notification on public.rental_properties;
create trigger rental_saved_search_match_notification
  after insert or update on public.rental_properties
  for each row execute function private.notify_saved_search_matches();

notify pgrst, 'reload schema';

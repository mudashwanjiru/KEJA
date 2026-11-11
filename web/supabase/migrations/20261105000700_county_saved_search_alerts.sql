alter table public.rental_saved_searches
  add column if not exists county text;

alter table public.rental_saved_searches
  drop constraint if exists rental_saved_searches_listing_type_check;

alter table public.rental_saved_searches
  add constraint rental_saved_searches_listing_type_check
  check (listing_type in ('rent', 'sale', 'short_stay'));

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
update public.rental_saved_searches searches
set county = counties.county_name,
    location = ''
from county_names counties
where searches.county is null
  and lower(btrim(searches.location)) = lower(counties.county_name);

create index if not exists rental_saved_searches_county_alerts_idx
  on public.rental_saved_searches (county, listing_type, user_id)
  where notify_new_listings;

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
      where ss.county = c.county_name
        or (ss.county is null and ss.location ilike '%' || c.county_name || '%')),
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
    and (s.county is null or s.county = new.county)
    and (
      s.location = ''
      or new.location_label ilike '%' || s.location || '%'
      or new.town ilike '%' || s.location || '%'
      or new.ward ilike '%' || s.location || '%'
    )
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

revoke all on function private.notify_saved_search_matches() from public, anon, authenticated;

notify pgrst, 'reload schema';

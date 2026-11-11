alter table public.stalls
  add column if not exists county text,
  add column if not exists town text;

alter table public.rental_properties
  add column if not exists county text,
  add column if not exists town text;

alter table public.stalls
  drop constraint if exists stalls_county_length_check,
  add constraint stalls_county_length_check
    check (county is null or char_length(btrim(county)) between 1 and 80),
  drop constraint if exists stalls_town_length_check,
  add constraint stalls_town_length_check
    check (town is null or char_length(btrim(town)) between 1 and 120);

alter table public.rental_properties
  drop constraint if exists rental_properties_county_length_check,
  add constraint rental_properties_county_length_check
    check (county is null or char_length(btrim(county)) between 1 and 80),
  drop constraint if exists rental_properties_town_length_check,
  add constraint rental_properties_town_length_check
    check (town is null or char_length(btrim(town)) between 1 and 120);

grant select (county, town) on public.stalls to anon, authenticated;
grant insert (county, town) on public.stalls to authenticated;

grant select (county, town) on public.rental_properties to anon, authenticated;
grant insert (county, town) on public.rental_properties to authenticated;
grant update (county, town) on public.rental_properties to authenticated;

create index if not exists stalls_public_county_search_idx
  on public.stalls (county, monthly_rent)
  where review_status = 'approved';

create index if not exists rental_properties_public_county_search_idx
  on public.rental_properties (county, listing_type, monthly_rent)
  where listing_status in ('available', 'available_soon')
    and verification_status = 'verified';

notify pgrst, 'reload schema';

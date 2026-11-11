alter table public.rental_properties
  add column if not exists ward text;

alter table public.stalls
  add column if not exists ward text;

alter table public.rental_properties
  drop constraint if exists rental_properties_ward_length_check,
  add constraint rental_properties_ward_length_check
    check (ward is null or char_length(btrim(ward)) between 1 and 120);

alter table public.stalls
  drop constraint if exists stalls_ward_length_check,
  add constraint stalls_ward_length_check
    check (ward is null or char_length(btrim(ward)) between 1 and 120);

grant select (ward) on public.rental_properties to anon, authenticated;
grant insert (ward) on public.rental_properties to authenticated;
grant update (ward) on public.rental_properties to authenticated;

grant select (ward) on public.stalls to anon, authenticated;
grant insert (ward) on public.stalls to authenticated;

create index if not exists rental_properties_public_ward_search_idx
  on public.rental_properties (county, town, ward)
  where listing_status in ('available', 'available_soon')
    and verification_status = 'verified';

create index if not exists stalls_public_ward_search_idx
  on public.stalls (county, town, ward)
  where review_status = 'approved';

notify pgrst, 'reload schema';

grant insert on table public.stalls to anon, authenticated;

drop policy if exists stalls_public_insert on public.stalls;
create policy stalls_public_insert
  on public.stalls
  for insert
  to anon, authenticated
  with check (
    owner_id is null
    and property_id is null
    and status = 'vacant'
    and char_length(btrim(stall_number)) between 1 and 80
    and monthly_rent > 0
    and (size_sqft is null or size_sqft >= 0)
  );

notify pgrst, 'reload schema';
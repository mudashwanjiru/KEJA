alter table public.service_requests
  add column pickup_location text,
  add column destination text,
  add column moving_date date,
  add column transport_type text,
  add column load_details text;

alter table public.service_requests
  add constraint service_requests_transport_type_check
    check (transport_type is null or transport_type in ('pickup', 'van', 'canter', 'lorry', 'other')),
  add constraint service_requests_moving_fields_check
    check (
      (
        pickup_location is null
        and destination is null
        and moving_date is null
        and transport_type is null
        and load_details is null
      )
      or (
        pickup_location is not null
        and destination is not null
        and moving_date is not null
        and transport_type is not null
        and load_details is not null
        and char_length(btrim(pickup_location)) between 3 and 240
        and char_length(btrim(destination)) between 3 and 240
        and char_length(btrim(load_details)) between 10 and 1500
      )
    );

create or replace function private.validate_service_moving_request()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.moving_date is not null and new.moving_date < current_date then
    raise exception 'Moving date cannot be in the past';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_service_moving_request() from public, anon, authenticated;
drop trigger if exists service_requests_validate_moving_date on public.service_requests;
create trigger service_requests_validate_moving_date
  before insert or update of moving_date on public.service_requests
  for each row execute function private.validate_service_moving_request();

grant select (pickup_location, destination, moving_date, transport_type, load_details)
  on public.service_requests to authenticated;
grant insert (pickup_location, destination, moving_date, transport_type, load_details)
  on public.service_requests to authenticated;

notify pgrst, 'reload schema';

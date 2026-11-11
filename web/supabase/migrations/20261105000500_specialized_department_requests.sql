alter table public.keja_directory_requests
  add column if not exists request_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(request_details) = 'object' and octet_length(request_details::text) <= 4000);

grant select (request_details) on public.keja_directory_requests to authenticated;
grant insert (request_details) on public.keja_directory_requests to authenticated;

create or replace function private.protect_keja_directory_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  listing_owner uuid;
  listing_department text;
  details jsonb := coalesce(new.request_details, '{}'::jsonb);
  details_date date;
begin
  select owner_id, department into listing_owner, listing_department
  from public.keja_directory_listings where id = new.listing_id;

  if tg_op = 'INSERT' then
    if jsonb_typeof(details) <> 'object' or octet_length(details::text) > 4000 then
      raise exception 'Request details must be a small JSON object';
    end if;

    if listing_department = 'health' then
      if details - array['service_requested', 'appointment_date', 'appointment_period'] <> '{}'::jsonb
        or char_length(btrim(coalesce(details ->> 'service_requested', ''))) not between 2 and 120
        or coalesce(details ->> 'appointment_period', '') not in ('morning', 'afternoon', 'evening')
        or coalesce(details ->> 'appointment_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or new.message <> 'Appointment request. No medical details provided.'
      then raise exception 'Provide a service, valid appointment date, and appointment period'; end if;
      details_date := (details ->> 'appointment_date')::date;
      if details_date < current_date then raise exception 'Appointment date cannot be in the past'; end if;
    elsif listing_department = 'education' then
      if details - array['program', 'learner_count', 'preferred_start_date'] <> '{}'::jsonb
        or char_length(btrim(coalesce(details ->> 'program', ''))) not between 2 and 120
        or coalesce(details ->> 'learner_count', '') !~ '^\d{1,2}$'
        or (details ->> 'learner_count')::integer not between 1 and 50
        or coalesce(details ->> 'preferred_start_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      then raise exception 'Provide a program, learner count, and valid preferred start date'; end if;
      details_date := (details ->> 'preferred_start_date')::date;
      if details_date < current_date then raise exception 'Preferred start date cannot be in the past'; end if;
    elsif listing_department = 'transport' then
      if details - array['pickup_location', 'destination', 'travel_date', 'transport_type', 'load_details'] <> '{}'::jsonb
        or char_length(btrim(coalesce(details ->> 'pickup_location', ''))) not between 2 and 160
        or char_length(btrim(coalesce(details ->> 'destination', ''))) not between 2 and 160
        or char_length(btrim(coalesce(details ->> 'load_details', ''))) not between 2 and 500
        or coalesce(details ->> 'transport_type', '') not in ('passenger', 'moving', 'delivery', 'other')
        or coalesce(details ->> 'travel_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      then raise exception 'Provide pickup, destination, transport type, load details, and a valid travel date'; end if;
      details_date := (details ->> 'travel_date')::date;
      if details_date < current_date then raise exception 'Travel date cannot be in the past'; end if;
    elsif listing_department = 'agriculture' then
      if details - array['item', 'quantity', 'unit', 'delivery_location'] <> '{}'::jsonb
        or char_length(btrim(coalesce(details ->> 'item', ''))) not between 2 and 120
        or coalesce(details ->> 'quantity', '') !~ '^\d{1,7}(\.\d{1,2})?$'
        or (details ->> 'quantity')::numeric <= 0
        or coalesce(details ->> 'unit', '') not in ('kg', 'bag', 'crate', 'litre', 'piece', 'other')
        or char_length(btrim(coalesce(details ->> 'delivery_location', ''))) not between 2 and 160
      then raise exception 'Provide an item, quantity, unit, and delivery location'; end if;
    elsif listing_department = 'events' then
      if details - array['event_date', 'guest_count', 'venue', 'service_required'] <> '{}'::jsonb
        or coalesce(details ->> 'event_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(details ->> 'guest_count', '') !~ '^\d{1,4}$'
        or (details ->> 'guest_count')::integer not between 1 and 50000
        or char_length(btrim(coalesce(details ->> 'venue', ''))) not between 2 and 160
        or char_length(btrim(coalesce(details ->> 'service_required', ''))) not between 2 and 300
      then raise exception 'Provide a valid event date, guest count, venue, and service required'; end if;
      details_date := (details ->> 'event_date')::date;
      if details_date < current_date then raise exception 'Event date cannot be in the past'; end if;
    elsif listing_department = 'businesses' then
      if details - array['inquiry_topic', 'organization_name'] <> '{}'::jsonb
        or char_length(btrim(coalesce(details ->> 'inquiry_topic', ''))) not between 2 and 160
        or char_length(btrim(coalesce(details ->> 'organization_name', ''))) not between 0 and 160
      then raise exception 'Provide an inquiry topic and optional organization name'; end if;
    elsif details <> '{}'::jsonb then
      raise exception 'Structured request details are not supported for this department';
    end if;
    new.request_details := details;
    new.updated_at := now();
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id
    or new.requester_id is distinct from old.requester_id
    or new.message is distinct from old.message
    or new.requested_date is distinct from old.requested_date
    or new.request_details is distinct from old.request_details
  then
    raise exception 'Directory request details cannot be edited after submission';
  end if;
  if auth.uid() = old.requester_id then
    if new.status <> 'cancelled' or old.status <> 'pending'
      or new.provider_response is distinct from old.provider_response
    then raise exception 'Customers can only cancel pending requests'; end if;
  elsif auth.uid() = listing_owner then
    if new.status not in ('responded', 'accepted', 'declined', 'completed')
      or old.status in ('cancelled', 'declined', 'completed')
    then raise exception 'The provider cannot make this request transition'; end if;
    if (old.status = 'pending' and new.status not in ('responded', 'declined'))
      or (old.status = 'responded' and new.status not in ('responded', 'accepted', 'declined'))
      or (old.status = 'accepted' and new.status not in ('accepted', 'completed', 'declined'))
    then raise exception 'The provider cannot make this request transition'; end if;
  elsif not private.is_platform_admin() then
    raise exception 'Only the customer, listing provider, or administrator can update this request';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_keja_directory_request() from public, anon, authenticated;

notify pgrst, 'reload schema';

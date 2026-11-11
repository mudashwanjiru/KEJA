alter table public.rental_properties
  add column if not exists last_confirmed_at timestamptz;

update public.rental_properties
set last_confirmed_at = created_at
where last_confirmed_at is null;

alter table public.rental_properties
  alter column last_confirmed_at set default now(),
  alter column last_confirmed_at set not null;

alter table public.stalls
  add column if not exists latitude double precision
    check (latitude is null or latitude between -90 and 90),
  add column if not exists longitude double precision
    check (longitude is null or longitude between -180 and 180),
  add column if not exists last_confirmed_at timestamptz;

update public.stalls
set last_confirmed_at = created_at
where last_confirmed_at is null;

alter table public.stalls
  alter column last_confirmed_at set default now(),
  alter column last_confirmed_at set not null;

grant insert (latitude, longitude) on public.stalls to authenticated;
revoke select (latitude, longitude) on public.stalls from anon, authenticated;

create or replace function public.set_commercial_stall_map_point(
  p_stall_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to update a stall map pin';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
  then
    raise exception 'Provide a valid latitude and longitude';
  end if;

  update public.stalls
  set latitude = p_latitude,
      longitude = p_longitude
  where id = p_stall_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'Stall not found or you are not its owner';
  end if;
end;
$$;

revoke all on function public.set_commercial_stall_map_point(uuid, double precision, double precision) from public, anon;
grant execute on function public.set_commercial_stall_map_point(uuid, double precision, double precision) to authenticated;

create or replace function public.confirm_keja_listing_freshness(
  p_listing_type text,
  p_listing_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  confirmed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in to confirm listing availability';
  end if;

  if p_listing_type = 'home' then
    update public.rental_properties
    set last_confirmed_at = now()
    where id = p_listing_id and owner_id = (select auth.uid())
    returning last_confirmed_at into confirmed_at;
  elsif p_listing_type = 'stall' then
    update public.stalls
    set last_confirmed_at = now()
    where id = p_listing_id and owner_id = (select auth.uid())
    returning last_confirmed_at into confirmed_at;
  else
    raise exception 'Unsupported listing type';
  end if;

  if confirmed_at is null then
    raise exception 'Listing not found or you are not its owner';
  end if;

  return confirmed_at;
end;
$$;

revoke all on function public.confirm_keja_listing_freshness(text, uuid) from public, anon;
grant execute on function public.confirm_keja_listing_freshness(text, uuid) to authenticated;

create or replace function public.commercial_stall_map_points(stall_ids uuid[])
returns table (stall_id uuid, latitude double precision, longitude double precision, is_approximate boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.id,
    case
      when s.owner_id = (select auth.uid()) then s.latitude
      else round(s.latitude::numeric, 2)::double precision
    end,
    case
      when s.owner_id = (select auth.uid()) then s.longitude
      else round(s.longitude::numeric, 2)::double precision
    end,
    s.owner_id is distinct from (select auth.uid())
  from public.stalls s
  where s.id = any(stall_ids)
    and s.latitude is not null
    and s.longitude is not null
    and (
      (s.review_status = 'approved' and private.is_active_subscription(s.owner_id))
      or s.owner_id = (select auth.uid())
    );
$$;

revoke all on function public.commercial_stall_map_points(uuid[]) from public;
grant execute on function public.commercial_stall_map_points(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

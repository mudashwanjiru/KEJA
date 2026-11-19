drop policy if exists rental_properties_insert_own on public.rental_properties;
create policy rental_properties_insert_own
  on public.rental_properties
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.is_active_subscription((select auth.uid()))
  );

create or replace function private.can_view_rental_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.rental_properties p
    where p.id = target_property_id
      and (
        (
          p.listing_status <> 'draft'
          and p.verification_status = 'verified'
          and private.is_active_subscription(p.owner_id)
        )
        or p.owner_id = (select auth.uid())
        or private.is_assigned_rental_property_staff(p.id)
        or private.is_rental_agency_agent_for_property(p.id)
        or private.is_platform_admin()
      )
  );
$$;

revoke all on function private.can_view_rental_property(uuid) from public, anon, authenticated;
grant execute on function private.can_view_rental_property(uuid) to anon, authenticated;

create or replace function public.rental_property_map_points(property_ids uuid[])
returns table (property_id uuid, latitude double precision, longitude double precision, is_approximate boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p.id,
    case
      when p.location_precision = 'exact' or p.owner_id = (select auth.uid()) then p.latitude
      else round(p.latitude::numeric, 2)::double precision
    end,
    case
      when p.location_precision = 'exact' or p.owner_id = (select auth.uid()) then p.longitude
      else round(p.longitude::numeric, 2)::double precision
    end,
    p.location_precision <> 'exact' and p.owner_id is distinct from (select auth.uid())
  from public.rental_properties p
  where p.id = any(property_ids)
    and p.latitude is not null
    and p.longitude is not null
    and private.can_view_rental_property(p.id)
    and (
      p.listing_status in ('available', 'available_soon', 'occupied')
      or p.owner_id = (select auth.uid())
    );
$$;

revoke all on function public.rental_property_map_points(uuid[]) from public;
grant execute on function public.rental_property_map_points(uuid[]) to anon, authenticated;

notify pgrst, 'reload schema';

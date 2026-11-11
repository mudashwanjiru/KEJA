alter table public.stalls
  add column if not exists review_status text;

update public.stalls
set review_status = 'pending'
where review_status is null;

alter table public.stalls
  alter column review_status set default 'pending',
  alter column review_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stalls_review_status_check'
      and conrelid = 'public.stalls'::regclass
  ) then
    alter table public.stalls
      add constraint stalls_review_status_check
      check (review_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create table if not exists public.stall_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.stall_reviewers enable row level security;
revoke all on table public.stall_reviewers from public, anon, authenticated;
grant select on table public.stall_reviewers to authenticated;

drop policy if exists stall_reviewers_read_self on public.stall_reviewers;
create policy stall_reviewers_read_self
  on public.stall_reviewers
  for select
  to authenticated
  using (user_id = (select auth.uid()));

alter table public.stalls enable row level security;

do $$
declare
  column_name text;
begin
  for column_name in
    select attname
    from pg_attribute
    where attrelid = 'public.stalls'::regclass
      and attnum > 0
      and not attisdropped
  loop
    execute format(
      'revoke all (%I) on table public.stalls from public, anon, authenticated',
      column_name
    );
  end loop;
end;
$$;

revoke select on table public.stalls from public, anon, authenticated;
revoke select (owner_id, property_id, review_status) on table public.stalls from public, anon, authenticated;
grant select (id, stall_number, monthly_rent, size_sqft, status) on table public.stalls to anon, authenticated;
grant select (review_status) on table public.stalls to authenticated;

revoke insert on table public.stalls from public, anon, authenticated;
revoke insert (property_id, stall_number, monthly_rent, size_sqft, status, owner_id, review_status)
  on table public.stalls from public, anon, authenticated;
grant insert (property_id, stall_number, monthly_rent, size_sqft, status, owner_id, review_status)
  on table public.stalls to anon, authenticated;

revoke update on table public.stalls from public, anon, authenticated;
revoke update (review_status) on table public.stalls from public, anon, authenticated;
grant update (review_status) on table public.stalls to authenticated;
revoke delete on table public.stalls from public, anon, authenticated;

drop policy if exists stalls_public_read on public.stalls;
drop policy if exists stalls_public_insert on public.stalls;
drop policy if exists stalls_landlord_insert on public.stalls;
drop policy if exists stalls_read_approved_or_reviewer on public.stalls;
drop policy if exists stalls_read_review_guard on public.stalls;
drop policy if exists stalls_public_pending_insert on public.stalls;
drop policy if exists stalls_landlord_pending_insert on public.stalls;
drop policy if exists stalls_insert_guard on public.stalls;
drop policy if exists stalls_reviewer_update on public.stalls;
drop policy if exists stalls_reviewer_update_guard on public.stalls;

create policy stalls_read_approved_or_reviewer
  on public.stalls
  for select
  to anon, authenticated
  using (
    review_status = 'approved'
    or (
      auth.uid() is not null
      and exists (
        select 1 from public.stall_reviewers
        where user_id = (select auth.uid())
      )
    )
  );

create policy stalls_read_review_guard
  on public.stalls
  as restrictive
  for select
  to anon, authenticated
  using (
    review_status = 'approved'
    or (
      auth.uid() is not null
      and exists (
        select 1 from public.stall_reviewers
        where user_id = (select auth.uid())
      )
    )
  );

create policy stalls_public_pending_insert
  on public.stalls
  for insert
  to anon, authenticated
  with check (
    owner_id is null
    and property_id is null
    and review_status = 'pending'
    and status = 'vacant'
    and char_length(btrim(stall_number)) between 1 and 80
    and monthly_rent > 0
    and (size_sqft is null or size_sqft >= 0)
  );

create policy stalls_landlord_pending_insert
  on public.stalls
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and review_status = 'pending'
    and status = 'vacant'
    and char_length(btrim(stall_number)) between 1 and 80
    and monthly_rent > 0
    and (size_sqft is null or size_sqft >= 0)
    and exists (
      select 1 from public.landlords
      where user_id = (select auth.uid())
    )
  );

create policy stalls_insert_guard
  on public.stalls
  as restrictive
  for insert
  to anon, authenticated
  with check (
    review_status = 'pending'
    and status = 'vacant'
    and char_length(btrim(stall_number)) between 1 and 80
    and monthly_rent > 0
    and (size_sqft is null or size_sqft >= 0)
    and (
      (owner_id is null and property_id is null)
      or (
        auth.uid() is not null
        and owner_id = (select auth.uid())
        and exists (
          select 1 from public.landlords
          where user_id = (select auth.uid())
        )
      )
    )
  );

create policy stalls_reviewer_update
  on public.stalls
  for update
  to authenticated
  using (
    review_status = 'pending'
    and exists (
      select 1 from public.stall_reviewers
      where user_id = (select auth.uid())
    )
  )
  with check (review_status in ('approved', 'rejected'));

create policy stalls_reviewer_update_guard
  on public.stalls
  as restrictive
  for update
  to authenticated
  using (
    review_status = 'pending'
    and exists (
      select 1 from public.stall_reviewers
      where user_id = (select auth.uid())
    )
  )
  with check (
    review_status in ('approved', 'rejected')
    and exists (
      select 1 from public.stall_reviewers
      where user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
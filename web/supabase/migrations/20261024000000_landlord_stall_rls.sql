alter table public.stalls
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create table if not exists public.landlords (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.landlords enable row level security;
alter table public.stalls enable row level security;

revoke all on table public.landlords from anon, authenticated;
grant select on table public.landlords to authenticated;

drop policy if exists landlords_read_self on public.landlords;
create policy landlords_read_self
  on public.landlords
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists stalls_public_read on public.stalls;
create policy stalls_public_read
  on public.stalls
  for select
  to anon, authenticated
  using (true);

drop policy if exists stalls_landlord_insert on public.stalls;
create policy stalls_landlord_insert
  on public.stalls
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.landlords
      where user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
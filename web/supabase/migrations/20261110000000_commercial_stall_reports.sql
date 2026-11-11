create table if not exists public.commercial_stall_reports (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in ('fake_listing', 'incorrect_information', 'unavailable', 'scam', 'other')
  ),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'pending' check (
    status in ('pending', 'reviewing', 'resolved', 'dismissed')
  ),
  created_at timestamptz not null default now()
);

create index if not exists commercial_stall_reports_status_created_at_idx
  on public.commercial_stall_reports (status, created_at)
  where status in ('pending', 'reviewing');

drop policy if exists stalls_admin_read on public.stalls;
create policy stalls_admin_read
  on public.stalls for select to authenticated
  using (private.is_platform_admin());

drop policy if exists stalls_read_review_guard on public.stalls;
create policy stalls_read_review_guard
  on public.stalls
  as restrictive
  for select
  to anon, authenticated
  using (
    (review_status = 'approved' and private.is_active_subscription(owner_id))
    or owner_id = (select auth.uid())
    or private.current_user_is_stall_reviewer()
    or private.is_platform_admin()
  );

alter table public.commercial_stall_reports enable row level security;
revoke all on public.commercial_stall_reports from public, anon, authenticated;
grant select, insert on public.commercial_stall_reports to authenticated;
grant update (status) on public.commercial_stall_reports to authenticated;

drop policy if exists commercial_stall_reports_read_reporter_or_admin
  on public.commercial_stall_reports;
create policy commercial_stall_reports_read_reporter_or_admin
  on public.commercial_stall_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists commercial_stall_reports_insert_self
  on public.commercial_stall_reports;
create policy commercial_stall_reports_insert_self
  on public.commercial_stall_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1
      from public.stalls
      where stalls.id = commercial_stall_reports.stall_id
        and stalls.review_status = 'approved'
        and private.is_active_subscription(stalls.owner_id)
    )
  );

drop policy if exists commercial_stall_reports_update_admin
  on public.commercial_stall_reports;
create policy commercial_stall_reports_update_admin
  on public.commercial_stall_reports for update to authenticated
  using (private.is_platform_admin())
  with check (private.is_platform_admin());

notify pgrst, 'reload schema';

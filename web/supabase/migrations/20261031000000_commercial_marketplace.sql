alter table public.stalls
  add column if not exists location_label text not null default 'Kenya',
  add column if not exists category text not null default 'General',
  add column if not exists description text not null default '';

alter table public.stalls
  drop constraint if exists stalls_category_length_check,
  add constraint stalls_category_length_check
    check (char_length(btrim(category)) between 1 and 80),
  drop constraint if exists stalls_location_label_length_check,
  add constraint stalls_location_label_length_check
    check (char_length(btrim(location_label)) between 1 and 160),
  drop constraint if exists stalls_description_length_check,
  add constraint stalls_description_length_check
    check (char_length(description) <= 2000);

grant insert (user_id) on table public.landlords to authenticated;

drop policy if exists landlords_register_self on public.landlords;
create policy landlords_register_self
  on public.landlords
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

revoke select (owner_id) on table public.stalls from public, anon, authenticated;
grant select (owner_id) on table public.stalls to authenticated;
grant select (location_label, category, description) on table public.stalls to anon, authenticated;
grant insert (location_label, category, description) on table public.stalls to anon, authenticated;

drop policy if exists stalls_read_approved_or_reviewer on public.stalls;
drop policy if exists stalls_landlord_read_own on public.stalls;
create policy stalls_landlord_read_own
  on public.stalls
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
  );

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
  );

create table if not exists public.stall_inquiries (
  id uuid primary key default gen_random_uuid(),
  stall_id uuid not null references public.stalls(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  contact_phone text not null,
  message text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint stall_inquiries_status_check
    check (status in ('pending', 'contacted', 'accepted', 'declined')),
  constraint stall_inquiries_business_name_check
    check (char_length(btrim(business_name)) between 1 and 120),
  constraint stall_inquiries_contact_phone_check
    check (char_length(btrim(contact_phone)) between 7 and 32),
  constraint stall_inquiries_message_check
    check (char_length(btrim(message)) between 10 and 2000),
  constraint stall_inquiries_one_per_applicant
    unique (stall_id, applicant_id)
);

create index if not exists stall_inquiries_stall_created_at_idx
  on public.stall_inquiries (stall_id, created_at desc);

alter table public.stall_inquiries enable row level security;
revoke all on table public.stall_inquiries from public, anon, authenticated;
grant select (id, stall_id, applicant_id, business_name, contact_phone, message, status, created_at)
  on table public.stall_inquiries to authenticated;
grant insert (stall_id, applicant_id, business_name, contact_phone, message)
  on table public.stall_inquiries to authenticated;
grant update (status) on table public.stall_inquiries to authenticated;

drop policy if exists stall_inquiries_read_participants on public.stall_inquiries;
create policy stall_inquiries_read_participants
  on public.stall_inquiries
  for select
  to authenticated
  using (
    applicant_id = (select auth.uid())
    or exists (
      select 1 from public.stalls
      where stalls.id = stall_inquiries.stall_id
        and stalls.owner_id = (select auth.uid())
    )
  );

drop policy if exists stall_inquiries_submit_application on public.stall_inquiries;
create policy stall_inquiries_submit_application
  on public.stall_inquiries
  for insert
  to authenticated
  with check (
    applicant_id = (select auth.uid())
    and status = 'pending'
    and char_length(btrim(business_name)) between 1 and 120
    and char_length(btrim(contact_phone)) between 7 and 32
    and char_length(btrim(message)) between 10 and 2000
    and exists (
      select 1 from public.stalls
      where stalls.id = stall_inquiries.stall_id
        and stalls.review_status = 'approved'
        and stalls.status = 'vacant'
        and stalls.owner_id is distinct from (select auth.uid())
    )
  );

drop policy if exists stall_inquiries_owner_update_status on public.stall_inquiries;
create policy stall_inquiries_owner_update_status
  on public.stall_inquiries
  for update
  to authenticated
  using (
    status in ('pending', 'contacted')
    and exists (
      select 1 from public.stalls
      where stalls.id = stall_inquiries.stall_id
        and stalls.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('pending', 'contacted', 'accepted', 'declined')
    and exists (
      select 1 from public.stalls
      where stalls.id = stall_inquiries.stall_id
        and stalls.owner_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';

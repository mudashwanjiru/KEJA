create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_until timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mpesa_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text not null,
  amount_kes integer not null check (amount_kes = 1000),
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt_number text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists mpesa_one_pending_payment_per_user
  on public.mpesa_payments (user_id)
  where status = 'pending';

alter table public.subscriptions enable row level security;
alter table public.mpesa_payments enable row level security;

revoke all on table public.subscriptions from public, anon, authenticated;
revoke all on table public.mpesa_payments from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant select on table public.mpesa_payments to authenticated;

drop policy if exists subscriptions_read_self on public.subscriptions;
create policy subscriptions_read_self
  on public.subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists mpesa_payments_read_self on public.mpesa_payments;
create policy mpesa_payments_read_self
  on public.mpesa_payments
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create or replace function private.is_active_subscription(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.subscriptions
    where user_id = p_user_id
      and active_until > now()
  );
$$;

create or replace function private.current_user_is_stall_reviewer()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.stall_reviewers
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_active_subscription(uuid) from public, anon, authenticated;
grant execute on function private.is_active_subscription(uuid) to anon, authenticated;
revoke all on function private.current_user_is_stall_reviewer() from public, anon, authenticated;
grant execute on function private.current_user_is_stall_reviewer() to anon, authenticated;

create or replace function public.apply_verified_mpesa_payment(
  p_checkout_request_id text,
  p_result_code text,
  p_amount_kes integer,
  p_phone_number text,
  p_receipt_number text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payment_row public.mpesa_payments%rowtype;
begin
  select *
  into payment_row
  from public.mpesa_payments
  where checkout_request_id = p_checkout_request_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;

  if payment_row.status <> 'pending' then
    return;
  end if;

  if p_result_code = '0' then
    if p_amount_kes is null
      or p_phone_number is null
      or p_receipt_number is null
      or p_amount_kes <> payment_row.amount_kes
      or p_phone_number <> payment_row.phone_number
      or p_receipt_number !~ '^[A-Z0-9]{8,12}$' then
      raise exception 'Verified payment details do not match request';
    end if;

    update public.mpesa_payments
    set status = 'paid',
        mpesa_receipt_number = p_receipt_number,
        paid_at = now()
    where id = payment_row.id;

    insert into public.subscriptions as existing_subscription (user_id, active_until)
    values (payment_row.user_id, now() + interval '1 month')
    on conflict (user_id) do update
    set active_until = greatest(existing_subscription.active_until, now()) + interval '1 month';
  else
    update public.mpesa_payments
    set status = 'failed'
    where id = payment_row.id;
  end if;
end;
$$;

revoke all on function public.apply_verified_mpesa_payment(text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_verified_mpesa_payment(text, text, integer, text, text)
  to service_role;

revoke insert on table public.stalls from public, anon, authenticated;
revoke insert (property_id, stall_number, monthly_rent, size_sqft, status, owner_id, review_status)
  on table public.stalls from public, anon, authenticated;
grant insert (property_id, stall_number, monthly_rent, size_sqft, status, owner_id, review_status)
  on table public.stalls to authenticated;

drop policy if exists stalls_public_pending_insert on public.stalls;
drop policy if exists stalls_landlord_pending_insert on public.stalls;
drop policy if exists stalls_insert_guard on public.stalls;
drop policy if exists stalls_read_approved_or_reviewer on public.stalls;
drop policy if exists stalls_read_approved_subscriber_or_reviewer on public.stalls;
drop policy if exists stalls_subscriber_pending_insert on public.stalls;
drop policy if exists stalls_subscription_insert_guard on public.stalls;

create policy stalls_read_approved_subscriber_or_reviewer
  on public.stalls
  for select
  to anon, authenticated
  using (
    (
      review_status = 'approved'
      and private.is_active_subscription(owner_id)
    )
    or private.current_user_is_stall_reviewer()
  );

create policy stalls_subscriber_pending_insert
  on public.stalls
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and property_id is null
    and review_status = 'pending'
    and status = 'vacant'
    and char_length(btrim(stall_number)) between 1 and 80
    and monthly_rent > 0
    and (size_sqft is null or size_sqft >= 0)
    and exists (
      select 1 from public.subscriptions
      where user_id = (select auth.uid())
        and active_until > now()
    )
  );

create policy stalls_subscription_insert_guard
  on public.stalls
  as restrictive
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and property_id is null
    and review_status = 'pending'
    and status = 'vacant'
    and char_length(btrim(stall_number)) between 1 and 80
    and monthly_rent > 0
    and (size_sqft is null or size_sqft >= 0)
    and exists (
      select 1 from public.subscriptions
      where user_id = (select auth.uid())
        and active_until > now()
    )
  );

drop policy if exists stalls_read_review_guard on public.stalls;
create policy stalls_read_review_guard
  on public.stalls
  as restrictive
  for select
  to anon, authenticated
  using (
    (
      review_status = 'approved'
      and private.is_active_subscription(owner_id)
    )
    or private.current_user_is_stall_reviewer()
  );

notify pgrst, 'reload schema';
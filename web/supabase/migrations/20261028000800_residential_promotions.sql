create table if not exists public.rental_promotion_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.rental_properties(id) on delete cascade,
  phone_number text not null,
  amount_kes integer not null check (amount_kes in (200, 500)),
  duration_days integer not null check (
    (amount_kes = 200 and duration_days = 7)
    or (amount_kes = 500 and duration_days = 30)
  ),
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt_number text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists rental_promotion_one_pending_payment_per_user
  on public.rental_promotion_payments (user_id)
  where status = 'pending';

create index if not exists rental_properties_featured_idx
  on public.rental_properties (featured_until desc)
  where featured_until is not null;

alter table public.rental_promotion_payments enable row level security;
revoke all on public.rental_promotion_payments from public, anon, authenticated;
grant select on public.rental_promotion_payments to authenticated;

drop policy if exists rental_promotion_payments_read_self on public.rental_promotion_payments;
create policy rental_promotion_payments_read_self
  on public.rental_promotion_payments for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.apply_verified_rental_promotion_payment(
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
  payment_row public.rental_promotion_payments%rowtype;
  property_owner uuid;
begin
  select * into payment_row
  from public.rental_promotion_payments
  where checkout_request_id = p_checkout_request_id
  for update;

  if not found then
    raise exception 'Residential promotion payment not found';
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
      or p_receipt_number !~ '^[A-Z0-9]{8,12}$'
    then
      raise exception 'Verified promotion payment details do not match request';
    end if;

    update public.rental_promotion_payments
    set status = 'paid',
        mpesa_receipt_number = p_receipt_number,
        paid_at = now()
    where id = payment_row.id;

    update public.rental_properties
    set featured_until = greatest(coalesce(featured_until, now()), now())
      + make_interval(days => payment_row.duration_days)
    where id = payment_row.property_id
      and verification_status = 'verified'
      and listing_status in ('available', 'available_soon')
    returning owner_id into property_owner;

    if found then
      insert into public.platform_notifications (user_id, kind, body, property_id)
      select distinct recipient.user_id, 'property_featured', 'M-Pesa payment confirmed. This property is now featured.', payment_row.property_id
      from unnest(array[payment_row.user_id, property_owner]) as recipient(user_id);
    else
      insert into public.platform_notifications (user_id, kind, body, property_id)
      values (
        payment_row.user_id,
        'promotion_needs_support',
        'Payment was received, but the property is no longer eligible to feature. Contact support for help.',
        payment_row.property_id
      );
    end if;
  else
    update public.rental_promotion_payments
    set status = 'failed'
    where id = payment_row.id;
  end if;
end;
$$;

revoke all on function public.apply_verified_rental_promotion_payment(text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_verified_rental_promotion_payment(text, text, integer, text, text)
  to service_role;

notify pgrst, 'reload schema';

create table if not exists public.pesapal_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_kes integer not null check (amount_kes = 1000),
  currency text not null default 'KES' check (currency = 'KES'),
  merchant_reference text not null unique,
  order_tracking_id text unique,
  checkout_url text,
  payment_method text,
  confirmation_code text unique,
  payment_status_description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists pesapal_one_pending_subscription_per_user
  on public.pesapal_subscription_payments (user_id)
  where status = 'pending';

alter table public.pesapal_subscription_payments enable row level security;
revoke all on table public.pesapal_subscription_payments from public, anon, authenticated;
grant select on table public.pesapal_subscription_payments to authenticated;

drop policy if exists pesapal_subscription_payments_read_self
  on public.pesapal_subscription_payments;
create policy pesapal_subscription_payments_read_self
  on public.pesapal_subscription_payments
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.apply_verified_pesapal_subscription_payment(
  p_request_id uuid,
  p_payment_status text,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_confirmation_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payment_row public.pesapal_subscription_payments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the payment service can apply a verified Pesapal payment';
  end if;

  select *
  into payment_row
  from public.pesapal_subscription_payments
  where request_id = p_request_id
  for update;

  if not found then
    raise exception 'Pesapal payment request not found';
  end if;

  if payment_row.status <> 'pending' then
    return;
  end if;

  if upper(coalesce(p_payment_status, '')) = 'COMPLETED' then
    if p_amount is null
      or p_amount <> payment_row.amount_kes
      or upper(coalesce(p_currency, '')) <> payment_row.currency
      or nullif(btrim(p_confirmation_code), '') is null then
      raise exception 'Verified Pesapal payment details do not match request';
    end if;

    update public.pesapal_subscription_payments
    set status = 'paid',
        payment_method = nullif(btrim(p_payment_method), ''),
        confirmation_code = btrim(p_confirmation_code),
        payment_status_description = p_payment_status,
        paid_at = now()
    where id = payment_row.id;

    insert into public.subscriptions as existing_subscription (user_id, active_until)
    values (payment_row.user_id, now() + interval '1 month')
    on conflict (user_id) do update
    set active_until = greatest(existing_subscription.active_until, now()) + interval '1 month';
  elsif upper(coalesce(p_payment_status, '')) in ('FAILED', 'INVALID', 'REVERSED', 'CANCELLED', 'CANCELED') then
    update public.pesapal_subscription_payments
    set status = 'failed',
        payment_status_description = p_payment_status
    where id = payment_row.id;
  end if;
end;
$$;

revoke all on function public.apply_verified_pesapal_subscription_payment(uuid, text, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_verified_pesapal_subscription_payment(uuid, text, numeric, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

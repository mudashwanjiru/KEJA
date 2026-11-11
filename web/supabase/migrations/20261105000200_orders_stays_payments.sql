alter table public.keja_directory_listings
  add column if not exists stock_quantity integer
  check (stock_quantity is null or stock_quantity >= 0);

grant select (stock_quantity) on public.keja_directory_listings to anon, authenticated;
grant insert (stock_quantity) on public.keja_directory_listings to authenticated;
grant update (stock_quantity) on public.keja_directory_listings to authenticated;

create table if not exists public.keja_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  department text not null check (department in ('marketplace', 'food')),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 32),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 5 and 500),
  total_amount numeric(12, 2) not null check (total_amount > 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'placed', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed')),
  inventory_reserved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.keja_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.keja_orders(id) on delete cascade,
  listing_id uuid not null references public.keja_directory_listings(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  price_unit text not null default '',
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'accepted', 'preparing', 'ready', 'completed', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists keja_orders_buyer_created_idx
  on public.keja_orders (buyer_id, created_at desc);
create index if not exists keja_order_items_seller_idx
  on public.keja_order_items (seller_id, created_at desc);
create unique index if not exists keja_order_items_listing_unique
  on public.keja_order_items (order_id, listing_id);

alter table public.keja_orders enable row level security;
alter table public.keja_order_items enable row level security;
revoke all on public.keja_orders, public.keja_order_items from public, anon, authenticated;
grant select on public.keja_orders, public.keja_order_items to authenticated;
grant update (fulfillment_status) on public.keja_order_items to authenticated;

create or replace function private.is_keja_order_buyer(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.keja_orders
    where id = p_order_id and buyer_id = (select auth.uid())
  );
$$;

create or replace function private.is_keja_order_seller(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.keja_order_items
    where order_id = p_order_id and seller_id = (select auth.uid())
  );
$$;

revoke all on function private.is_keja_order_buyer(uuid) from public, anon, authenticated;
revoke all on function private.is_keja_order_seller(uuid) from public, anon, authenticated;
grant execute on function private.is_keja_order_buyer(uuid) to authenticated;
grant execute on function private.is_keja_order_seller(uuid) to authenticated;

drop policy if exists keja_orders_participant_read on public.keja_orders;
create policy keja_orders_participant_read on public.keja_orders
  for select to authenticated using (
    private.is_keja_order_buyer(id)
    or private.is_keja_order_seller(id)
    or private.is_platform_admin()
  );

drop policy if exists keja_order_items_participant_read on public.keja_order_items;
create policy keja_order_items_participant_read on public.keja_order_items
  for select to authenticated using (
    seller_id = (select auth.uid())
    or private.is_keja_order_buyer(order_id)
    or private.is_platform_admin()
  );

drop policy if exists keja_order_items_seller_fulfill on public.keja_order_items;
create policy keja_order_items_seller_fulfill on public.keja_order_items
  for update to authenticated using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create or replace function private.protect_keja_order_item_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  order_payment_status text;
begin
  if new.order_id is distinct from old.order_id
    or new.listing_id is distinct from old.listing_id
    or new.seller_id is distinct from old.seller_id
    or new.title is distinct from old.title
    or new.quantity is distinct from old.quantity
    or new.unit_price is distinct from old.unit_price
    or new.price_unit is distinct from old.price_unit
  then
    raise exception 'Order details cannot be changed';
  end if;
  select payment_status into order_payment_status
  from public.keja_orders where id = old.order_id;
  if order_payment_status <> 'paid' then
    raise exception 'Orders can only be fulfilled after payment';
  end if;
  if not (
    (old.fulfillment_status = 'pending' and new.fulfillment_status in ('accepted', 'declined'))
    or (old.fulfillment_status = 'accepted' and new.fulfillment_status in ('preparing', 'declined'))
    or (old.fulfillment_status = 'preparing' and new.fulfillment_status in ('ready', 'completed'))
    or (old.fulfillment_status = 'ready' and new.fulfillment_status = 'completed')
  ) then
    raise exception 'Invalid order fulfillment status change';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_keja_order_item_fulfillment() from public, anon, authenticated;
drop trigger if exists keja_order_item_fulfillment_guard on public.keja_order_items;
create trigger keja_order_item_fulfillment_guard before update on public.keja_order_items
  for each row execute function private.protect_keja_order_item_fulfillment();

create or replace function public.create_keja_order(
  p_items jsonb,
  p_contact_phone text,
  p_delivery_address text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  buyer uuid := auth.uid();
  item jsonb;
  listing public.keja_directory_listings%rowtype;
  order_id uuid := gen_random_uuid();
  order_department text;
  item_id uuid;
  item_quantity integer;
  order_total numeric(12, 2) := 0;
begin
  if buyer is null then raise exception 'Sign in to place an order'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Order must contain between 1 and 30 items';
  end if;
  if char_length(btrim(p_contact_phone)) not between 7 and 32
    or char_length(btrim(p_delivery_address)) not between 5 and 500 then
    raise exception 'Enter a valid contact phone and delivery address';
  end if;

  for item in select value from jsonb_array_elements(p_items) order by value ->> 'listing_id'
  loop
    begin
      item_id := (item ->> 'listing_id')::uuid;
      item_quantity := (item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Invalid order item';
    end;
    if item_quantity < 1 or item_quantity > 99 then
      raise exception 'Each quantity must be between 1 and 99';
    end if;
    select * into listing from public.keja_directory_listings
      where id = item_id and status = 'approved'
        and department in ('marketplace', 'food')
      for update;
    if not found then raise exception 'An item is no longer available'; end if;
    if listing.owner_id = buyer then raise exception 'You cannot order your own listing'; end if;
    if listing.price is null or listing.price <= 0 then
      raise exception 'An item does not have a valid price';
    end if;
    if listing.stock_quantity is not null and listing.stock_quantity < item_quantity then
      raise exception 'An item has insufficient stock';
    end if;
    if order_department is null then
      order_department := listing.department;
    elsif order_department <> listing.department then
      raise exception 'Keep product orders and food orders in separate checkouts';
    end if;
    order_total := order_total + listing.price * item_quantity;
  end loop;

  if order_total <= 0 or order_total > 1000000 then
    raise exception 'Order total is outside the supported range';
  end if;
  order_total := round(order_total);
  insert into public.keja_orders (
    id, buyer_id, department, contact_phone, delivery_address, total_amount
  ) values (
    order_id, buyer, order_department, btrim(p_contact_phone), btrim(p_delivery_address), order_total
  );

  for item in select value from jsonb_array_elements(p_items) order by value ->> 'listing_id'
  loop
    item_id := (item ->> 'listing_id')::uuid;
    item_quantity := (item ->> 'quantity')::integer;
    select * into listing from public.keja_directory_listings where id = item_id for update;
    insert into public.keja_order_items (
      order_id, listing_id, seller_id, title, quantity, unit_price, price_unit
    ) values (
      order_id, listing.id, listing.owner_id, listing.title, item_quantity, listing.price, listing.price_unit
    );
  end loop;

  return order_id;
end;
$$;

revoke all on function public.create_keja_order(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_keja_order(jsonb, text, text) to authenticated;

create or replace function public.reserve_keja_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  order_row public.keja_orders%rowtype;
  item_row record;
begin
  select * into order_row from public.keja_orders where id = p_order_id for update;
  if not found or order_row.payment_status in ('paid', 'pending') then
    raise exception 'Order is not available for inventory reservation';
  end if;
  if order_row.inventory_reserved then return; end if;

  for item_row in
    select i.listing_id, i.quantity
    from public.keja_order_items i
    where i.order_id = p_order_id
    order by i.listing_id
  loop
    perform 1 from public.keja_directory_listings
      where id = item_row.listing_id for update;
    if not found then raise exception 'An ordered listing is no longer available'; end if;
    if exists (
      select 1 from public.keja_directory_listings
      where id = item_row.listing_id
        and stock_quantity is not null and stock_quantity < item_row.quantity
    ) then
      raise exception 'An item no longer has enough stock';
    end if;
  end loop;

  for item_row in
    select i.listing_id, i.quantity
    from public.keja_order_items i
    where i.order_id = p_order_id
    order by i.listing_id
  loop
    update public.keja_directory_listings
      set stock_quantity = stock_quantity - item_row.quantity
      where id = item_row.listing_id and stock_quantity is not null;
  end loop;
  update public.keja_orders set inventory_reserved = true, payment_status = 'pending', updated_at = now()
    where id = p_order_id;
end;
$$;

create or replace function public.release_keja_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item_row record;
begin
  perform 1 from public.keja_orders
    where id = p_order_id and inventory_reserved and payment_status <> 'paid'
    for update;
  if not found then return; end if;
  for item_row in
    select i.listing_id, i.quantity
    from public.keja_order_items i
    where i.order_id = p_order_id
    order by i.listing_id
  loop
    update public.keja_directory_listings
      set stock_quantity = stock_quantity + item_row.quantity
      where id = item_row.listing_id and stock_quantity is not null;
  end loop;
  update public.keja_orders
    set inventory_reserved = false, payment_status = 'failed', updated_at = now()
    where id = p_order_id;
end;
$$;

revoke all on function public.reserve_keja_order_inventory(uuid) from public, anon, authenticated;
revoke all on function public.release_keja_order_inventory(uuid) from public, anon, authenticated;
grant execute on function public.reserve_keja_order_inventory(uuid) to service_role;
grant execute on function public.release_keja_order_inventory(uuid) to service_role;

create table if not exists public.keja_order_mpesa_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  order_id uuid not null references public.keja_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text not null check (phone_number ~ '^254[17][0-9]{8}$'),
  amount_kes integer not null check (amount_kes > 0),
  merchant_request_id text,
  checkout_request_id text unique,
  mpesa_receipt_number text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists keja_order_one_pending_mpesa
  on public.keja_order_mpesa_payments (order_id) where status = 'pending';
alter table public.keja_order_mpesa_payments enable row level security;
revoke all on public.keja_order_mpesa_payments from public, anon, authenticated;
grant select (request_id, order_id, amount_kes, status, created_at)
  on public.keja_order_mpesa_payments to authenticated;
create policy keja_order_mpesa_read_self on public.keja_order_mpesa_payments
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.apply_verified_keja_order_payment(
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
  payment_row public.keja_order_mpesa_payments%rowtype;
begin
  select * into payment_row from public.keja_order_mpesa_payments
    where checkout_request_id = p_checkout_request_id for update;
  if not found then raise exception 'Order payment request not found'; end if;
  if payment_row.status <> 'pending' then return; end if;

  if p_result_code = '0' then
    if p_amount_kes is null or p_phone_number is null or p_receipt_number is null
      or p_amount_kes <> payment_row.amount_kes
      or p_phone_number <> payment_row.phone_number
      or p_receipt_number !~ '^[A-Z0-9]{8,12}$' then
      raise exception 'Verified order payment details do not match request';
    end if;
    update public.keja_order_mpesa_payments set status = 'paid',
      mpesa_receipt_number = p_receipt_number, paid_at = now()
      where id = payment_row.id;
    update public.keja_orders set payment_status = 'paid', status = 'placed', updated_at = now()
      where id = payment_row.order_id and payment_status = 'pending';
  else
    update public.keja_order_mpesa_payments set status = 'failed' where id = payment_row.id;
    perform public.release_keja_order_inventory(payment_row.order_id);
    update public.keja_orders set payment_status = 'failed', updated_at = now()
      where id = payment_row.order_id and payment_status = 'pending';
  end if;
end;
$$;

revoke all on function public.apply_verified_keja_order_payment(text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_verified_keja_order_payment(text, text, integer, text, text)
  to service_role;

create table if not exists public.keja_stay_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.keja_directory_listings(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  guest_name text not null check (char_length(btrim(guest_name)) between 2 and 120),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 7 and 32),
  check_in date not null,
  check_out date not null,
  guest_count smallint not null check (guest_count between 1 and 30),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

create index if not exists keja_stay_requests_listing_dates_idx
  on public.keja_stay_requests (listing_id, check_in, check_out)
  where status in ('requested', 'confirmed');
create index if not exists keja_stay_requests_guest_created_idx
  on public.keja_stay_requests (guest_id, created_at desc);
alter table public.keja_stay_requests enable row level security;
revoke all on public.keja_stay_requests from public, anon, authenticated;
grant select, insert on public.keja_stay_requests to authenticated;
grant update (status) on public.keja_stay_requests to authenticated;

create policy keja_stay_requests_read_participants on public.keja_stay_requests
  for select to authenticated using (
    guest_id = (select auth.uid())
    or exists (
      select 1 from public.keja_directory_listings l
      where l.id = keja_stay_requests.listing_id and l.owner_id = (select auth.uid())
    )
    or private.is_platform_admin()
  );
create policy keja_stay_requests_create_guest on public.keja_stay_requests
  for insert to authenticated with check (
    guest_id = (select auth.uid())
    and exists (
      select 1 from public.keja_directory_listings l
      where l.id = keja_stay_requests.listing_id
        and l.department = 'accommodation'
        and l.status = 'approved'
        and l.owner_id <> (select auth.uid())
    )
  );
create policy keja_stay_requests_update_host_guest on public.keja_stay_requests
  for update to authenticated using (
    (guest_id = (select auth.uid()) and keja_stay_requests.status = 'requested')
    or exists (
      select 1 from public.keja_directory_listings l
      where l.id = keja_stay_requests.listing_id
        and l.owner_id = (select auth.uid())
        and keja_stay_requests.status in ('requested', 'confirmed')
    )
  ) with check (
    (guest_id = (select auth.uid()) and keja_stay_requests.status = 'cancelled')
    or exists (
      select 1 from public.keja_directory_listings l
      where l.id = keja_stay_requests.listing_id
        and l.owner_id = (select auth.uid())
        and keja_stay_requests.status in ('requested', 'confirmed', 'declined', 'completed', 'cancelled')
    )
  );

create or replace function private.protect_keja_stay_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.check_in < current_date then
      raise exception 'Check-in date cannot be in the past';
    end if;
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id
    or new.guest_id is distinct from old.guest_id
    or new.guest_name is distinct from old.guest_name
    or new.contact_phone is distinct from old.contact_phone
    or new.check_in is distinct from old.check_in
    or new.check_out is distinct from old.check_out
    or new.guest_count is distinct from old.guest_count
    or new.message is distinct from old.message then
    raise exception 'Stay request details cannot be changed';
  end if;

  if auth.uid() = old.guest_id then
    if old.status <> 'requested' or new.status <> 'cancelled' then
      raise exception 'Guests may only cancel requested stays';
    end if;
  elsif not exists (
    select 1 from public.keja_directory_listings l
    where l.id = old.listing_id and l.owner_id = auth.uid()
  ) then
    raise exception 'Only the guest or host may update a stay request';
  elsif not (
    (old.status = 'requested' and new.status in ('confirmed', 'declined', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid host stay request status change';
  end if;

  if new.status = 'confirmed' then
    perform 1 from public.keja_directory_listings where id = new.listing_id for update;
    if exists (
      select 1 from public.keja_stay_requests existing
      where existing.listing_id = new.listing_id
        and existing.id <> new.id
        and existing.status = 'confirmed'
        and existing.check_in < new.check_out
        and existing.check_out > new.check_in
    ) then
      raise exception 'Those dates overlap a confirmed stay';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_keja_stay_request() from public, anon, authenticated;
create trigger keja_stay_request_status_guard before insert or update on public.keja_stay_requests
  for each row execute function private.protect_keja_stay_request();

notify pgrst, 'reload schema';

create or replace function private.notify_property_job_application()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_owner uuid;
  job_title text;
begin
  select owner_id, title into job_owner, job_title
  from public.property_jobs where id = new.job_id;

  if tg_op = 'INSERT' then
    insert into public.platform_notifications (user_id, kind, body)
    values (job_owner, 'job_application', 'A new application was submitted for ' || job_title || '.');
  elsif new.status is distinct from old.status then
    insert into public.platform_notifications (user_id, kind, body)
    values (new.applicant_id, 'job_application_update', 'Your application for ' || job_title || ' was updated to ' || replace(new.status, '_', ' ') || '.');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_property_job_application() from public, anon, authenticated;
drop trigger if exists property_job_application_notification on public.property_job_applications;
create trigger property_job_application_notification
  after insert or update of status on public.property_job_applications
  for each row execute function private.notify_property_job_application();

create or replace function private.notify_keja_order_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  seller record;
begin
  if new.payment_status is distinct from old.payment_status and new.payment_status = 'paid' then
    insert into public.platform_notifications (user_id, kind, body)
    values (new.buyer_id, 'order_payment', 'Your KEJA order payment was confirmed.');

    for seller in
      select distinct seller_id from public.keja_order_items where order_id = new.id
    loop
      insert into public.platform_notifications (user_id, kind, body)
      values (seller.seller_id, 'order_received', 'A paid KEJA order is ready for fulfillment.');
    end loop;
  elsif new.payment_status is distinct from old.payment_status and new.payment_status = 'failed' then
    insert into public.platform_notifications (user_id, kind, body)
    values (new.buyer_id, 'order_payment', 'Your KEJA order payment was not completed. You can try again from your orders page.');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_keja_order_payment() from public, anon, authenticated;
drop trigger if exists keja_order_payment_notification on public.keja_orders;
create trigger keja_order_payment_notification
  after update of payment_status on public.keja_orders
  for each row execute function private.notify_keja_order_payment();

create or replace function private.notify_keja_order_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  buyer uuid;
begin
  if new.fulfillment_status is distinct from old.fulfillment_status then
    select buyer_id into buyer from public.keja_orders where id = new.order_id;
    insert into public.platform_notifications (user_id, kind, body)
    values (buyer, 'order_fulfillment', 'Your order item "' || new.title || '" is now ' || replace(new.fulfillment_status, '_', ' ') || '.');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_keja_order_fulfillment() from public, anon, authenticated;
drop trigger if exists keja_order_fulfillment_notification on public.keja_order_items;
create trigger keja_order_fulfillment_notification
  after update of fulfillment_status on public.keja_order_items
  for each row execute function private.notify_keja_order_fulfillment();

create or replace function private.notify_keja_stay_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  host_id uuid;
  property_title text;
begin
  select owner_id, title into host_id, property_title
  from public.keja_directory_listings where id = new.listing_id;
  if tg_op = 'INSERT' then
    insert into public.platform_notifications (user_id, kind, body)
    values (host_id, 'stay_request', 'A guest requested dates for ' || property_title || '.');
  elsif new.status is distinct from old.status then
    if auth.uid() = host_id then
      insert into public.platform_notifications (user_id, kind, body)
      values (new.guest_id, 'stay_request_update', 'The host updated your stay request for ' || property_title || '.');
    else
      insert into public.platform_notifications (user_id, kind, body)
      values (host_id, 'stay_request_update', 'A guest updated their stay request for ' || property_title || '.');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_keja_stay_request() from public, anon, authenticated;
drop trigger if exists keja_stay_request_notification on public.keja_stay_requests;
create trigger keja_stay_request_notification
  after insert or update of status on public.keja_stay_requests
  for each row execute function private.notify_keja_stay_request();

create or replace function private.notify_short_stay_booking()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  host_id uuid;
  property_title text;
begin
  select owner_id, title into host_id, property_title
  from public.rental_properties where id = new.property_id;
  if tg_op = 'INSERT' then
    insert into public.platform_notifications (user_id, kind, body, property_id)
    values (host_id, 'stay_request', 'A guest requested dates for ' || property_title || '.', new.property_id);
  elsif new.status is distinct from old.status then
    if auth.uid() = host_id then
      insert into public.platform_notifications (user_id, kind, body, property_id)
      values (new.requester_id, 'stay_request_update', 'The host updated your stay request for ' || property_title || '.', new.property_id);
    else
      insert into public.platform_notifications (user_id, kind, body, property_id)
      values (host_id, 'stay_request_update', 'A guest updated their stay request for ' || property_title || '.', new.property_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_short_stay_booking() from public, anon, authenticated;
drop trigger if exists short_stay_booking_notification on public.short_stay_bookings;
create trigger short_stay_booking_notification
  after insert or update of status on public.short_stay_bookings
  for each row execute function private.notify_short_stay_booking();

create or replace function private.notify_service_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_user uuid;
  provider_name text;
begin
  select user_id, business_name into provider_user, provider_name
  from public.service_providers where id = new.provider_id;
  if tg_op = 'INSERT' then
    insert into public.platform_notifications (user_id, kind, body)
    values (provider_user, 'service_request', 'A customer sent a request to ' || provider_name || '.');
  elsif new.status is distinct from old.status then
    insert into public.platform_notifications (user_id, kind, body)
    values (new.requester_id, 'service_request_update', 'Your request to ' || provider_name || ' was updated to ' || replace(new.status, '_', ' ') || '.');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_service_request() from public, anon, authenticated;
drop trigger if exists service_request_notification on public.service_requests;
create trigger service_request_notification
  after insert or update of status on public.service_requests
  for each row execute function private.notify_service_request();

notify pgrst, 'reload schema';

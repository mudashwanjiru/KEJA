alter table public.keja_directory_listings
  drop constraint if exists keja_directory_listings_department_check,
  add constraint keja_directory_listings_department_check
    check (department in (
      'marketplace', 'food', 'construction', 'health', 'education', 'transport',
      'accommodation', 'agriculture', 'events', 'essentials', 'automotive', 'businesses'
    ));

notify pgrst, 'reload schema';

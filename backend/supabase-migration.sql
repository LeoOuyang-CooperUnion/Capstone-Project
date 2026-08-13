-- Run once in the Supabase SQL editor before starting this version.
-- The transaction makes this migration atomic: any error rolls everything back.
begin;

alter table public.measurements
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_name text,
  add column if not exists location_address text,
  add column if not exists environment text;

alter table public.measurements
  drop constraint if exists measurements_latitude_check,
  add constraint measurements_latitude_check
    check (latitude is null or latitude between -90 and 90),
  drop constraint if exists measurements_longitude_check,
  add constraint measurements_longitude_check
    check (longitude is null or longitude between -180 and 180),
  drop constraint if exists measurements_environment_check,
  add constraint measurements_environment_check
    check (environment is null or environment in ('indoor', 'outdoor'));

commit;

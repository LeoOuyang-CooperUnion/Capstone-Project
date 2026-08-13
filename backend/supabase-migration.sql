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

create table if not exists public.stations (
  device_id text primary key,
  location_name text not null,
  location_address text,
  latitude double precision not null,
  longitude double precision not null,
  environment text not null,
  accuracy_meters double precision,
  registered_at timestamp with time zone not null default now(),
  constraint stations_location_name_check
    check (char_length(location_name) between 1 and 100),
  constraint stations_location_address_check
    check (location_address is null or char_length(location_address) between 1 and 300),
  constraint stations_latitude_check
    check (latitude between -90 and 90),
  constraint stations_longitude_check
    check (longitude between -180 and 180),
  constraint stations_environment_check
    check (environment in ('indoor', 'outdoor')),
  constraint stations_accuracy_check
    check (accuracy_meters between 0 and 100000)
);

alter table public.stations enable row level security;

-- Address geocoding does not provide a defensible meter-accuracy estimate.
-- Keep accuracy nullable rather than inventing a value.
alter table public.stations
  alter column accuracy_meters drop not null;

commit;

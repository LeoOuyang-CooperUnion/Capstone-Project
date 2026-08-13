-- Run once in the Supabase SQL editor before starting this version.
-- The transaction makes this migration atomic: any error rolls everything back.
begin;

alter table public.stations
  alter column registered_at set default now();

alter table public.measurements
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_name text,
  add column if not exists location_address text,
  add column if not exists environment text;

alter table public.measurements
  drop constraint if exists measurements_source_check,
  add constraint measurements_source_check check (
    source in ('device_upload', 'manual_serial_monitor_entry', 'manual_browser_entry')
  );

-- Group manual readings into a stable station using an approximately 11 m grid.
-- Keep the newest location metadata when old readings share a grid coordinate.
insert into public.stations (
  device_id, location_name, location_address, latitude, longitude, environment
)
select distinct on (round(latitude::numeric, 4), round(longitude::numeric, 4))
  'manual_' || to_char(round(latitude::numeric, 4), 'FM999990.0000') || '_' || to_char(round(longitude::numeric, 4), 'FM999990.0000'),
  coalesce(location_name, 'User-selected location'),
  location_address,
  latitude,
  longitude,
  coalesce(environment, 'indoor')
from public.measurements
where station_id is null and latitude is not null and longitude is not null
order by round(latitude::numeric, 4), round(longitude::numeric, 4), received_at desc
on conflict (device_id) do update set
  location_name = excluded.location_name,
  location_address = excluded.location_address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  environment = excluded.environment;

update public.measurements
set station_id = 'manual_' || to_char(round(latitude::numeric, 4), 'FM999990.0000') || '_' || to_char(round(longitude::numeric, 4), 'FM999990.0000')
where station_id is null and latitude is not null and longitude is not null;

alter table public.measurements
  drop constraint if exists measurements_station_id_fkey,
  add constraint measurements_station_id_fkey
    foreign key (station_id) references public.stations(device_id);

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

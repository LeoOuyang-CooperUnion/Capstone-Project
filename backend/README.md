# Weather comparison backend

This Express server stores validated BME280 observations in Supabase and
serves the local Leaflet comparison demo. Only the backend reads secrets or
calls external weather providers.

## Setup

1. Run `npm install` from the project root.
2. Copy `.env.example` to `.env`.
3. Set the device, Supabase, and fixed demo-location variables. Keep `.env`
   private.
   To enable address autocomplete, create a Geoapify project and set the
   optional server-side `GEOAPIFY_API_KEY`; complete-address Census lookup
   remains available without it.
4. Back up the `measurements` table, then run
   `backend/supabase-migration.sql` in the Supabase SQL editor. The script is
   idempotent and transactional; if a constraint finds invalid existing data,
   the whole migration rolls back.
5. Run `npm start`.
6. Visit `http://localhost:3000/health`, then `http://localhost:3000`.

Required demo-location variables:

```dotenv
DEMO_LOCATION_NAME=The Cooper Union
DEMO_ADDRESS=7 East 7th Street, New York, NY 10003
DEMO_LATITUDE=40.7290
DEMO_LONGITUDE=-73.9902
DEMO_ENVIRONMENT=indoor
NWS_STATION_LIMIT=5
```

To verify the migration in the SQL editor without exposing row data, run:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'measurements'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'stations'
order by ordinal_position;
```

## Demo behavior

Copy temperature, humidity, and pressure from the Arduino Serial Monitor into
the form, or enable the authenticated ESP32 upload. The backend adds its
timestamp and active station location. Browser geolocation is requested only
after the user selects **Use my current location**. Coordinates and reported
accuracy must be reviewed and confirmed before they are stored. The address is
optional and is not inferred from Wi-Fi. Registration and manual entry are
restricted to requests from the computer running the backend.

As an alternative, the user can enter a U.S. address and request estimated
coordinates from the U.S. Census Geocoder. The address is sent to that external
service. Census coordinates are calculated from address-range data and do not
include a defensible meter-accuracy value, so `accuracy_meters` remains null.
When Geoapify is configured, partial address text is sent to its autocomplete
service after a short delay. Selecting a suggestion fills and previews the
address and Geoapify coordinates directly. Manually entered complete addresses
continue to use the Census result. Both paths are labelled as estimates and do
not claim a meter-accuracy value.

The example fallback configuration defaults to Cooper Union. A confirmed
browser registration is stored by `DEVICE_ID` and overrides that fallback for
future manual and direct ESP32 uploads. Existing measurement rows keep the
location recorded when they were accepted.

Browser geolocation generally requires HTTPS; `http://localhost` is accepted
for local development. It may not work when the page is opened through a raw
LAN address such as `http://192.168.x.x:3000`.

The Leaflet map shows three explicitly labelled sources:

- the manually entered BME280 observation;
- nearby physical National Weather Service observations; and
- Open-Meteo modeled conditions for the configured coordinates.

Map tiles and outside comparisons require internet access. A provider failure
does not prevent a manual observation from being submitted. Open-Meteo surface
pressure is compared with BME280 surface pressure; unavailable NWS values are
shown as unavailable rather than invented.

## Endpoints

- `GET /health`
- `GET /api/demo-config`
- `GET /api/address-suggestions` (local computer only; optional Geoapify key)
- `POST /api/geocode-address` (local computer only; U.S. addresses)
- `POST /api/station-registration` (local computer only)
- `GET /api/comparisons/current`
- `POST /api/demo-observations`
- `GET /api/measurements/recent`
- `POST /api/devices/:id/readings`

Manual observation body:

```json
{
  "temperatureC": 21.5,
  "humidityPercent": 61.0,
  "pressureHpa": 1010.8
}
```

The automatic ESP32 endpoint additionally requires the matching
`X-Device-Secret` header. It associates accepted observations with the current
registration for that `DEVICE_ID`, or with the `.env` fallback if no
registration exists.

## Hosting

For a hosted version, configure all variables from `.env.example` on the host.
The app honors the platform-provided `PORT`. Deploy over HTTPS and do not
expose `.env`, `secrets.h`, or the Supabase secret key.

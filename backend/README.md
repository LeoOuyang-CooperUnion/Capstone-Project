# Weather comparison backend

This Express server stores validated BME280 observations in Supabase and
serves the local Leaflet comparison demo. Only the backend reads secrets or
calls external weather providers.

## Setup

1. Run `npm install` from the project root.
2. Copy `.env.example` to `.env`.
3. Set the Supabase and default demo-location variables. Keep `.env`
   private.
   To enable address autocomplete, also set `GEOAPIFY_API_KEY` to a Geoapify
   Address Autocomplete API key.
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
```

## Demo behavior

The currently supported path is BME280 -> ESP32-S3 -> Arduino Serial Monitor
at 115200 baud -> manual browser entry -> backend storage and comparison.
Copy temperature, humidity, and pressure from the Arduino Serial Monitor into
the form. Select a browser location or enter an address; the resulting editable
coordinates are stored with the reading. The manual endpoint is restricted to
requests from the computer running the backend.

The example configuration defaults to Cooper Union until the user selects a
location. Address and reverse-address lookup use OpenStreetMap Nominatim.

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
- `GET /api/comparisons/current`
- `GET /api/geocode?address=...`
- `GET /api/address-suggestions?address=...`
- `GET /api/reverse-geocode?latitude=...&longitude=...`
- `POST /api/demo-observations`
- `GET /api/measurements/recent`

The recent-measurements endpoint returns at most one measurement per station:
the newest reading. This prevents historical readings at the same station from
producing overlapping map points.

Manual observation body:

```json
{
  "temperatureC": 21.5,
  "humidityPercent": 61.0,
  "pressureHpa": 1010.8,
  "address": "7 East 7th Street, New York, NY 10003",
  "latitude": 40.729,
  "longitude": -73.9902
}
```

## Hosting

For a hosted version, configure all variables from `.env.example` on the host.
The app honors the platform-provided `PORT`. Deploy over HTTPS and do not
expose `.env`, `secrets.h`, or the Supabase secret key.

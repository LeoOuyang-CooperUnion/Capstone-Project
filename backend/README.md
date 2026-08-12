# Weather comparison backend

This Express server stores validated BME280 observations in Supabase and
serves the local Leaflet comparison demo. Only the backend reads secrets or
calls external weather providers.

## Setup

1. Run `npm install` from the project root.
2. Copy `.env.example` to `.env`.
3. Set the device, Supabase, and fixed demo-location variables. Keep `.env`
   private.
4. Run `backend/supabase-migration.sql` once in the Supabase SQL editor.
5. Run `npm start`.
6. Visit `http://localhost:3000/health`, then `http://localhost:3000`.

Required demo-location variables:

```dotenv
DEMO_LOCATION_NAME=Capstone demonstration station
DEMO_LATITUDE=40.7128
DEMO_LONGITUDE=-74.0060
DEMO_ENVIRONMENT=indoor
NWS_STATION_LIMIT=5
```

## Demo behavior

Copy temperature, humidity, and pressure from the Arduino Serial Monitor into
the form. The backend adds its timestamp and the configured physical station
location. Browser geolocation is not requested. The manual endpoint is
restricted to requests from the computer running the backend.

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
`X-Device-Secret` header. Automatic upload remains available for a later
connected milestone but is disabled in the current firmware configuration.

## Hosting

For a hosted version, configure all variables from `.env.example` on the host.
The app honors the platform-provided `PORT`. Deploy over HTTPS and do not
expose `.env`, `secrets.h`, or the Supabase secret key.

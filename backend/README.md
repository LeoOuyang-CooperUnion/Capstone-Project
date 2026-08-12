# Milestone 2 backend

This small Express server accepts validated observations and stores them in
Supabase. Only the backend reads the Supabase secret key.

## Pitch-demo input (no ESP32 Wi-Fi required)

With the backend running, open `http://localhost:3000` on the same computer.
Choose **Use my browser location** or enter latitude and longitude manually,
then validate the location. You can then optionally copy the three values from
Arduino Serial Monitor into the **Manual Serial Monitor demo** form. This is a
local-only, manually entered demonstration—not an automatic device upload—and
is not stored as measurement history.

This local prototype requires no user account. It records the location source
as browser-provided or user-selected, assigns a validation timestamp, and
logs the location-ready state. It does not claim that the selected location
has been verified as the sensor's physical location. The manual-demo endpoint
rejects requests that do not originate on the same computer.

## Setup

1. Run `npm install` from the project root.
2. Copy `.env.example` to `.env`.
3. Set `DEVICE_SECRET`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`. Keep this
   file private.
4. Run `npm start`.
5. Open `http://localhost:3000/health`. It should return `{"status":"ok"}`.

## Hosting for the pitch

Render is a straightforward option for this Express app. Push the project to
a private GitHub repository (do not commit `.env` or `secrets.h`), then create
a Render **Web Service** from that repository with:

- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `DEVICE_ID` and `DEVICE_SECRET` with the same values
  used locally. Do not create `PORT`; Render provides it automatically.

After deployment, Render provides an HTTPS URL. Open that URL to use the
location-validation page and add `/health` to confirm the service is running.
The browser location button requires permission from the user. The page still
works with manually entered coordinates if permission is declined.

## ESP32 configuration

Copy `esp32/bme280_serial_monitor/secrets.h.example` to `secrets.h` in the
same folder. Set the Wi-Fi details, the matching device ID and secret, and
your computer's **local IPv4 address** in `BACKEND_URL`.

For example, if the computer's IPv4 address is `192.168.1.50`:

```cpp
const char BACKEND_URL[] = "http://192.168.1.50:3000";
```

The ESP32 and computer must use the same local network. Windows Firewall may
need to allow Node.js on private networks. Plain HTTP is acceptable only for
this local development test; deploy over HTTPS before using the device beyond
your trusted local network.

## Endpoint

`POST /api/devices/weather-station-001/readings`

Required header: `X-Device-Secret: <your secret>`

Example body:

```json
{
  "temperatureC": 21.5,
  "humidityPercent": 61.0,
  "pressureHpa": 1010.8
}
```

The server assigns `receivedAt`; the ESP32 does not provide a timestamp.

## Recent history endpoint

`GET /api/measurements/recent` returns up to 50 stored observations, newest
first. It supports the future history dashboard.

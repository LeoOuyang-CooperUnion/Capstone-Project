# Milestone 2 backend

This small Express server accepts an authenticated BME280 observation and logs
it. It does **not** store measurements yet; Supabase storage starts in
Milestone 3.

## Setup

1. Run `npm install` from the project root.
2. Copy `.env.example` to `.env`.
3. Set `DEVICE_SECRET` to a long random value. Keep this file private.
4. Run `npm start`.
5. Open `http://localhost:3000/health`. It should return `{"status":"ok"}`.

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

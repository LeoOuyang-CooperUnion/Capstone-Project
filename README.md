# Accessible Hyperlocal Weather Station

An affordable, community-oriented weather observation project built around an
ESP32-S3 and BME280 environmental sensor.

## Current demo

The ESP32 prints temperature, relative humidity, and surface pressure to its
Serial Monitor. The presenter copies those values into the local web app at
`http://localhost:3000`; ESP32 Wi-Fi is not required.

This is the supported demonstration workflow:

```text
BME280 -> ESP32-S3 -> Arduino Serial Monitor (115200 baud)
        -> manual browser entry -> backend storage and comparison
```

The backend timestamps each manual observation and links it to a Supabase
station at the browser-selected location. Locations within the same
four-decimal coordinate grid share one station. A Leaflet map compares it with:

- nearby physical National Weather Service observations; and
- Open-Meteo modeled conditions at the demonstration location.

These sources are labelled separately. Open-Meteo values are model output,
not another physical sensor. Manual entries are also distinguished from future
automatic device uploads.

Manual entry and backend storage continue to work if Leaflet, map tiles, NWS,
Open-Meteo, or another external service is unavailable. In that case the page
keeps the form enabled and shows the local observation and any available
comparison information as text.

Setup is documented in [`backend/README.md`](backend/README.md). Firmware and
wiring instructions are in [`esp32/README.md`](esp32/README.md).

The example configuration supplies an initial location. Users can grant browser
location permission or enter an address to convert it to editable coordinates.

## Decisions confirmed for the first deployment

- Start with one device and no user accounts.
- Test first in the United States.
- Allow browser geolocation or address lookup, with visible editable coordinates.
- Let the backend timestamp accepted uploads.
- Keep indoor readings clearly labelled; outdoor environmental observations
  require a weather-safe enclosure and radiation shield.

## Scientific note

The BME280 measures temperature, relative humidity, and surface pressure. It
cannot forecast weather by itself. The interface labels sensor observations,
official station observations, model conditions, and their timestamps.

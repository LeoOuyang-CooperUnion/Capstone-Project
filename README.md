# Accessible Hyperlocal Weather Station

An affordable, community-oriented weather observation project built around an
ESP32-S3 and BME280 environmental sensor. It reports **local observations**;
external forecast information will be added separately in a later milestone.

## Current milestone

**Milestone 2 — ESP32 to backend.** The BME280 sketch in
[`esp32/bme280_serial_monitor`](esp32/bme280_serial_monitor) sends one
authenticated local observation per minute to the JavaScript backend. The
backend assigns its receipt timestamp and logs accepted readings. Setup is in
[`backend/README.md`](backend/README.md).

Supabase is used in Milestone 3 to store validated observations. Manual
Serial Monitor entries are marked separately from future automatic device
uploads.

For a local pitch demo where ESP32 Wi-Fi is unavailable, visit
`http://localhost:3000` while the backend is running. The page accepts the
browser-provided or manually selected location, then can validate values
manually copied from the Arduino Serial Monitor. Those values are clearly
labelled as a local demo entry, not an automatic device upload or stored
history. The selected location is not treated as a verified sensor location.

## Decisions confirmed for the first deployment

- Start with one device and no user accounts.
- Test first in the United States, while retaining a globally useful design.
- The backend, not the ESP32, will timestamp accepted uploads.
- Indoor readings are useful for learning and connectivity tests; outdoor
  environmental observations need a weather-safe enclosure and radiation
  shield before they should be treated as local outdoor conditions.

## Scientific note

The BME280 measures temperature, relative humidity, and pressure. It cannot
forecast weather by itself. Future screens will label sensor observations,
weather-service forecasts, and any interpretation separately.

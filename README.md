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

Supabase is the planned database for Milestone 3. It is deliberately not used
yet: first we verify secure sensor-to-server delivery before storing data.

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

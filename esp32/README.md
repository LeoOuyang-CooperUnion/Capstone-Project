# ESP32-S3 firmware

## Milestone 2: manual Serial Monitor demo

`bme280_serial_monitor/bme280_serial_monitor.ino` verifies this data path:

```text
BME280 -> ESP32-S3 Serial Monitor -> manual browser entry
```

The default sketch does not compile Wi-Fi support and does not require
`secrets.h`. It prints every observation to Serial Monitor at 115200 baud.

### Wiring

Use your board's labeled I2C pins; ESP32-S3 development boards do not all use
the same GPIO pins. Connect:

| BME280 | ESP32-S3 |
| --- | --- |
| VIN / 3V3 | 3.3V |
| GND | GND |
| SDA | Board SDA / I2C data pin |
| SCL | Board SCL / I2C clock pin |

Use 3.3V logic. If your breakout board has a `VIN` pin, consult its
documentation before connecting 5V.

### Arduino IDE setup

1. Install the Arduino IDE and the Espressif ESP32 board package.
2. Select your ESP32-S3 board and its USB/serial port.
3. In Library Manager, install `Adafruit BME280 Library`. Arduino will also
   offer `Adafruit Unified Sensor`; install it.
4. Open `bme280_serial_monitor.ino`, upload it, and open Serial Monitor at
   **115200 baud**.

### Optional later Wi-Fi upload

This implementation is preserved for future work but is currently unavailable.
Do not enable or depend on it for the working demonstration.

1. Change `#define ENABLE_WIFI_UPLOAD 0` to `1` in the sketch.
2. Copy `bme280_serial_monitor/secrets.h.example` to
   `bme280_serial_monitor/secrets.h`. This private file is already excluded
   from Git.
3. Enter the Wi-Fi network name and password. Set `DEVICE_ID` and
   `DEVICE_SECRET` to the exact values in the project's root `.env` file.
4. Set `BACKEND_URL` to the local IPv4 address of the computer running the
   backend, including port `3000`. Do not use `localhost` or `127.0.0.1`:
   those addresses would refer to the ESP32 itself.
5. On the computer, start the backend from the project root with `npm start`.
   Confirm `http://localhost:3000/health` returns `{"status":"ok"}`.
6. Ensure the ESP32 and computer are on the same Wi-Fi network, select the
   correct ESP32-S3 board and serial port in Arduino IDE, then upload the
   sketch. If Windows asks, allow Node.js through the firewall on **private**
   networks.
7. Open Serial Monitor at **115200 baud**. After a Wi-Fi connection succeeds,
   the sketch sends one reading immediately and then one each minute.

Successful output includes `Wi-Fi connected`, the three sensor values, and
`Observation uploaded successfully.` The backend console should log an
`Accepted observation` with a server-assigned `receivedAt` timestamp.

If the upload fails, check the HTTP status printed in Serial Monitor:

- `401`: the device ID or device secret does not exactly match `.env`.
- `400`: the payload was rejected; record the backend error message.
- A negative HTTP status: the ESP32 cannot reach the backend; recheck the
  computer IPv4 address, Wi-Fi network, firewall, and that `npm start` is
  still running.

This project's BME280 uses I2C address `0x76`.

### Expected output

```text
BME280 found at I2C address 0x76
--- Local sensor observation ---
Temperature: 22.4 C
Humidity:    45.1 %
Pressure:    1013.2 hPa
```

Indoor testing is suitable for this milestone. Readings from an indoor sensor
must not be presented as outdoor neighborhood weather. Before outdoor tests,
use a weather-resistant enclosure that shades the sensor while allowing air to
flow around it.

The backend assigns receipt timestamps. Offline flash buffering is intentionally
deferred until a later milestone; this version waits 30 seconds between failed
Wi-Fi connection attempts and does not hammer the backend while disconnected.

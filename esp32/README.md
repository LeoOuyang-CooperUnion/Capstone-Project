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

The backend assigns receipt timestamps after the user submits the values in the
browser.

#include <Wire.h>
#include <Adafruit_BME280.h>

constexpr unsigned long READING_INTERVAL_MS = 60000;
constexpr uint8_t BME280_I2C_ADDRESS = 0x76;

Adafruit_BME280 bme;
bool sensorAvailable = false;
unsigned long lastReadingAt = 0;

bool connectBme280() {
  if (bme.begin(BME280_I2C_ADDRESS, &Wire)) {
    Serial.print("BME280 found at I2C address 0x");
    Serial.println(BME280_I2C_ADDRESS, HEX);
    return true;
  }
  return false;
}

void printObservation() {
  const float temperatureC = bme.readTemperature();
  const float humidityPercent = bme.readHumidity();
  const float pressureHpa = bme.readPressure() / 100.0F;

  if (isnan(temperatureC) || isnan(humidityPercent) || isnan(pressureHpa)) {
    Serial.println("Unable to read the BME280. Check wiring and power.");
    return;
  }

  Serial.println("--- Local sensor observation ---");
  Serial.printf("Temperature: %.1f C\n", temperatureC);
  Serial.printf("Humidity:    %.1f %%\n", humidityPercent);
  Serial.printf("Pressure:    %.1f hPa\n", pressureHpa);
  Serial.println("Copy these values into the web app manually.");
}

void setup() {
  Serial.begin(115200);
  const unsigned long serialWaitStartedAt = millis();
  while (!Serial && millis() - serialWaitStartedAt < 4000) {}

  Serial.println("\nStarting BME280 serial monitor...");
  Wire.begin();
  sensorAvailable = connectBme280();
  if (!sensorAvailable) {
    Serial.println("BME280 not detected at 0x76.");
    Serial.println("Check SDA, SCL, 3.3V, GND, and your board's I2C pins.");
    return;
  }

  printObservation();
  lastReadingAt = millis();
}

void loop() {
  if (!sensorAvailable) {
    delay(1000);
    return;
  }

  if (millis() - lastReadingAt >= READING_INTERVAL_MS) {
    printObservation();
    lastReadingAt = millis();
  }
}

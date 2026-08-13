#include <Wire.h>
#include <Adafruit_BME280.h>
// The supported demonstration is Serial Monitor -> manual browser entry.
// Direct Wi-Fi upload is retained for future work but is currently unavailable.
#define ENABLE_WIFI_UPLOAD 0

#if ENABLE_WIFI_UPLOAD
#include <HTTPClient.h>
#include <WiFi.h>
#include "secrets.h"
#endif

constexpr unsigned long READING_INTERVAL_MS = 60000;
#if ENABLE_WIFI_UPLOAD
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 30000;
#endif
constexpr uint8_t BME280_I2C_ADDRESS = 0x76;

Adafruit_BME280 bme;
bool sensorAvailable = false;
unsigned long lastReadingAt = 0;
#if ENABLE_WIFI_UPLOAD
unsigned long lastWifiAttemptAt = 0;

void reportWifiEvent(WiFiEvent_t event, WiFiEventInfo_t eventInfo) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    Serial.printf("Wi-Fi disconnected (reason code %d).\n",
                  eventInfo.wifi_sta_disconnected.reason);
  }
}

void printWifiScanResults() {
  Serial.println("Scanning for nearby Wi-Fi networks...");
  const int networkCount = WiFi.scanNetworks();

  if (networkCount <= 0) {
    Serial.println("No Wi-Fi networks found. Move closer to the hotspot and confirm it is broadcasting.");
    return;
  }

  bool configuredNetworkFound = false;
  for (int index = 0; index < networkCount; index++) {
    const String networkName = WiFi.SSID(index);
    if (networkName == WIFI_SSID) {
      configuredNetworkFound = true;
      Serial.printf("Configured Wi-Fi network found (RSSI %d dBm, channel %d).\n",
                    WiFi.RSSI(index), WiFi.channel(index));
    }
  }

  if (!configuredNetworkFound) {
    Serial.println("Configured Wi-Fi network was not found. Check its name, range, and 2.4 GHz setting.");
  }
}
#endif

bool connectBme280() {
  if (bme.begin(BME280_I2C_ADDRESS, &Wire)) {
    Serial.print("BME280 found at I2C address 0x");
    Serial.println(BME280_I2C_ADDRESS, HEX);
    return true;
  }

  return false;
}

bool readAndSendObservation() {
  const float temperatureC = bme.readTemperature();
  const float humidityPercent = bme.readHumidity();
  const float pressureHpa = bme.readPressure() / 100.0F;

  if (isnan(temperatureC) || isnan(humidityPercent) || isnan(pressureHpa)) {
    Serial.println("Unable to read the BME280. Check wiring and power.");
    return false;
  }

  Serial.println("--- Local sensor observation ---");
  Serial.printf("Temperature: %.1f C\n", temperatureC);
  Serial.printf("Humidity:    %.1f %%\n", humidityPercent);
  Serial.printf("Pressure:    %.1f hPa\n", pressureHpa);
  Serial.println("This is an observation, not a weather forecast.");

#if !ENABLE_WIFI_UPLOAD
    Serial.println("Manual demo mode: copy these values into the local web app.");
    return true;
#else

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi unavailable. Observation was not uploaded.");
    return false;
  }

  HTTPClient http;
  const String endpoint = String(BACKEND_URL) + "/api/devices/" + DEVICE_ID + "/readings";
  http.begin(endpoint);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Secret", DEVICE_SECRET);

  const String payload = String("{\"temperatureC\":") + String(temperatureC, 2) +
    ",\"humidityPercent\":" + String(humidityPercent, 2) +
    ",\"pressureHpa\":" + String(pressureHpa, 2) + "}";
  const int responseCode = http.POST(payload);

  if (responseCode == HTTP_CODE_CREATED) {
    Serial.println("Observation uploaded successfully.");
    Serial.println(http.getString());
    http.end();
    return true;
  }

  Serial.printf("Upload failed (HTTP %d): %s\n", responseCode, http.getString().c_str());
  http.end();
  return false;
#endif
}

#if ENABLE_WIFI_UPLOAD
void connectToWifiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED || millis() - lastWifiAttemptAt < WIFI_RETRY_INTERVAL_MS) {
    return;
  }

  lastWifiAttemptAt = millis();
  // Clear a previous stalled connection attempt before starting a new one.
  // This prevents ESP32-S3 Wi-Fi from reporting "sta is connecting" on retry.
  WiFi.disconnect(false, true);
  delay(250);
  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long attemptStartedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - attemptStartedAt < 10000) {
    delay(500);
    Serial.print('.');
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nWi-Fi connected. ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWi-Fi connection failed. Retrying in 30 seconds.");
  }
}
#endif

void setup() {
  Serial.begin(115200);
  const unsigned long serialWaitStartedAt = millis();
  while (!Serial && millis() - serialWaitStartedAt < 4000) {
    // Allows time for Serial Monitor to connect without blocking the board.
  }

  Serial.println("\nStarting BME280 serial test...");
  Wire.begin();

  sensorAvailable = connectBme280();
  if (!sensorAvailable) {
    Serial.println("BME280 not detected at 0x76.");
    Serial.println("Check SDA, SCL, 3.3V, GND, and your board's I2C pins.");
    return;
  }

#if ENABLE_WIFI_UPLOAD
    WiFi.onEvent(reportWifiEvent);
    WiFi.mode(WIFI_STA);
    printWifiScanResults();
    connectToWifiIfNeeded();
#else
    Serial.println("Manual demo mode enabled. Wi-Fi uploads are disabled.");
#endif
  readAndSendObservation();
  lastReadingAt = millis();
}

void loop() {
  if (!sensorAvailable) {
    delay(1000);
    return;
  }

#if ENABLE_WIFI_UPLOAD
    connectToWifiIfNeeded();
#endif

  if (millis() - lastReadingAt >= READING_INTERVAL_MS) {
    readAndSendObservation();
    lastReadingAt = millis();
  }
}

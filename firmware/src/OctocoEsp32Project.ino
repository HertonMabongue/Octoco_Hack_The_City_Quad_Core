/*
  Smart Bin Monitoring — ESP32 + Arduino IDE

  Four independent subsystems, kept deliberately separate:
    1. Ultrasonic sensor  -> bin fill level
    2. PIR sensor         -> estimated people traffic near the bin
    3. Gas sensor         -> hazard warning
    4. Accelerometer      -> unusual movement / possible theft warning

  All four feed a single OLED display, which shows whichever has the
  highest priority right now (gas > maintenance > movement > bin full >
  medium > not full), plus the traffic reading underneath. A high-traffic
  reading does NOT mean the bin is full, and a movement alert does NOT mean
  theft has definitely occurred — they are independent, best-effort
  measurements shown together.

  Connectivity: the ESP32 joins wifi (WIFI_SSID in the repo-root .env) and
  POSTs a JSON reading every 30 s to PUBLIC_API_URL (the ngrok URL) at
  /api/devices/{DEVICE_SLUG}/readings. The backend relays it to the city
  mainframe over MQTT. Networking runs in its own FreeRTOS task, so a slow
  or dead connection can never stall the sensors or the display.

  Three modes (the city protocol's normal / maintenance / emergency), each
  with its own LED pattern and OLED banner:
    NORMAL       LED off
    MAINTENANCE  LED slow blink (1 s) — toggled with the BOOT button (GPIO0);
                 a technician servicing the bin silences tamper/overflow
                 alerts, but never a gas hazard
    EMERGENCY    LED fast blink — gas hazard, possible tamper, or bin at/above
                 FILL_CRITICAL_PCT
  Mode priority mirrors backend/app/telemetry.py derive_mode().
*/

#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// Accelerometer: ADXL345 over I2C. (Assumed from the part number given —
// "ADXL3620346" isn't a real part; the ADXL345 is the standard digital,
// I2C-capable member of the ADXL family, which is what the SDA/SCL wiring
// below requires. If a different digital accelerometer is actually
// fitted, swap this include and the accel.begin()/getEvent() calls in
// setup()/detectAbnormalMovement() — nothing else in this file needs to
// change.)
// Install via Arduino IDE Library Manager: "Adafruit ADXL345" and its
// dependency "Adafruit Unified Sensor".
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "config.h"   // wifi, API URL, device id, shared thresholds (from the repo-root .env)

// ---------- Pin definitions ----------
#define TRIG_PIN       5
#define ECHO_PIN       18
#define LED_PIN        13
#define PIR_PIN        27
#define GAS_AO_PIN     34
#define GAS_DO_PIN     -1   // not used

#define OLED_SCK       22
#define OLED_MOSI      23
#define OLED_RESET     16
#define OLED_DC        17
#define OLED_CS        -1   // not used

// Accelerometer (I2C) — do not use GPIO21/22 for this bus; 22 is already
// the OLED's SPI clock.
#define ACCEL_SCL      32
#define ACCEL_SDA      33

// Maintenance switch: the dev board's own BOOT button, so no extra wiring.
// Press to toggle. (Holding it while resetting enters flash mode — normal.)
#define MODE_BUTTON_PIN 0
#define BUTTON_DEBOUNCE_MS 50UL

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

// ---------- Thresholds (named, never hard-coded below) ----------
#define FULL_DISTANCE       3.0f   // cm — at or below this, bin is 100% full (also overflow_flag)
#define BIN_EMPTY_DISTANCE 15.0f   // cm — at or beyond this, bin is 0% full. Calibrate to the real bin depth.
#define GAS_THRESHOLD      GAS_ALERT_RAW // raw ADC reading — prototype alert threshold, not a ppm value (set in .env)
#define FILL_FILTER_SAMPLES   5    // median of the last N distance readings, so one bad echo can't swing the fill %

#define TRAFFIC_INTERVAL  10000UL  // ms — length of one traffic observation window
#define TRAFFIC_THRESHOLD     5    // events per window — above this is "high traffic"

#define ULTRASONIC_TIMEOUT_US 30000UL // pulseIn timeout, so a missing echo can't hang the loop
#define NO_OBJECT_DISTANCE    -1.0f   // internal marker meaning "no echo received" — never shown as a real distance

#define LED_EMERGENCY_INTERVAL_MS   150UL   // fast blink
#define LED_MAINTENANCE_INTERVAL_MS 1000UL  // slow blink

// ---------- Accelerometer / movement thresholds (NEW) ----------
#define MOVEMENT_THRESHOLD_MS2          3.0f  // m/s^2 delta from baseline considered "significant" — prototype value, not a calibrated figure
#define MOVEMENT_CONSECUTIVE_READINGS      5  // ~1s of sustained movement at this loop's ~200ms pace, so one bump/vibration/noise spike can't trigger an alert
#define BASELINE_SAMPLE_COUNT             10  // samples averaged at startup to establish the "stationary" baseline

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, OLED_MOSI, OLED_SCK, OLED_DC, OLED_RESET, OLED_CS);
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345); // NEW — sensor ID is arbitrary, just needs to be unique

// ---------- PIR / traffic state ----------
bool pirLastState = LOW;        // previous PIR reading, to detect LOW->HIGH transitions
int peopleCount = 0;            // events counted in the current window
unsigned long trafficWindowStart = 0;
int lastPeopleCount = 0;        // events counted in the most recently completed window (what's displayed)
bool lastTrafficHigh = false;   // classification for the most recently completed window

// ---------- LED flash state ----------
unsigned long lastLedToggle = 0;
bool ledState = false;

// ---------- Modes ----------
enum DeviceMode { MODE_NORMAL, MODE_MAINTENANCE, MODE_EMERGENCY };
bool maintenanceSwitch = false;       // toggled by the BOOT button
bool buttonLastRaw = HIGH;            // INPUT_PULLUP: HIGH = released
bool buttonStable = HIGH;
unsigned long buttonChangedAt = 0;

// ---------- Fill-level filter ----------
float distSamples[FILL_FILTER_SAMPLES];
int distSampleCount = 0;
int distSampleNext = 0;
bool echoSeenInWindow = false;        // false = every recent reading was "no echo"

// ---------- Shared with the network task ----------
// The sensor loop writes this; the network task copies it under the mutex.
struct Snapshot {
  float fillPct;
  float distanceCm;      // < 0 when no echo was seen recently
  bool overflow;
  int gasRaw;
  int peopleCount;
  bool movementAlert;
  DeviceMode mode;
};
Snapshot snapshot = {0, -1, false, 0, 0, false, MODE_NORMAL};
SemaphoreHandle_t snapshotMutex;
volatile bool wifiConnected = false;
volatile bool lastPostOk = false;     // result of the most recent POST, for the OLED

// ---------- Accelerometer / movement state (NEW) ----------
bool accelAvailable = false;        // true once the accelerometer is detected in setup()
float baselineAccelX = 0, baselineAccelY = 0, baselineAccelZ = 0; // "stationary" reference, set once at startup
float lastAccelX = 0, lastAccelY = 0, lastAccelZ = 0;             // most recent reading, for Serial/display
int movementExceedStreak = 0;       // consecutive loop iterations the delta has exceeded the threshold

// ---------- Function declarations ----------
float readUltrasonicDistance();
int readGasLevel();
bool isPersonDetected();
void updateTrafficCount();
void updateDisplay(float distance, float fillPct, int gasValue, bool gasAlert, bool movementAlert, DeviceMode mode);
void handleModeLED(DeviceMode mode);
void pollModeButton();
float filteredDistance(float rawDistance);
float fillPercent(float distanceCm);
DeviceMode computeMode(bool gasAlert, bool movementAlert, float fillPct);
const char* modeName(DeviceMode mode);
void networkTask(void* arg);
bool postReading(const Snapshot& snap);
void calibrateAccelBaseline();       // NEW
bool detectAbnormalMovement();       // NEW

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(MODE_BUTTON_PIN, INPUT_PULLUP);
  digitalWrite(TRIG_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  // Hardware reset pulse required for this SPI OLED to initialise reliably.
  pinMode(OLED_RESET, OUTPUT);
  digitalWrite(OLED_RESET, LOW);
  delay(10);
  digitalWrite(OLED_RESET, HIGH);
  delay(10);

  if (!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println(F("OLED allocation failed - check SPI wiring"));
    for (;;);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(F("Smart Bin Starting..."));
  display.display();
  delay(1000);

  trafficWindowStart = millis();

  // ---------------- Accelerometer setup (NEW) ----------------
  // Independent of the OLED (separate bus: I2C vs SPI), so an issue here
  // never blocks ultrasonic/PIR/gas/OLED from working — movement
  // detection just stays disabled if the sensor isn't found.
  Wire.begin(ACCEL_SDA, ACCEL_SCL);
  accelAvailable = accel.begin();
  if (!accelAvailable) {
    Serial.println(F("Accelerometer not detected - check I2C wiring (movement detection disabled)"));
  } else {
    accel.setRange(ADXL345_RANGE_2_G);
    Serial.println(F("Calibrating accelerometer baseline - keep the bin still..."));
    calibrateAccelBaseline();
    Serial.println(F("Accelerometer baseline set."));
  }

  // ---------------- Networking (own task, so it can never block sensing) ----------------
  snapshotMutex = xSemaphoreCreateMutex();
  xTaskCreatePinnedToCore(networkTask, "net", 10240, NULL, 1, NULL, 0); // core 0; Arduino loop() is core 1
}

void loop() {
  float distance = readUltrasonicDistance();
  float filteredCm = filteredDistance(distance);
  float fillPct = fillPercent(filteredCm);
  int gasValue = readGasLevel();
  bool gasAlert = (gasValue >= GAS_THRESHOLD);
  bool movementAlert = detectAbnormalMovement(); // NEW

  updateTrafficCount();
  pollModeButton();

  bool binFull = (distance > 0) && (distance <= FULL_DISTANCE);
  DeviceMode mode = computeMode(gasAlert, movementAlert, fillPct);

  // Publish the latest picture for the network task.
  if (xSemaphoreTake(snapshotMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
    snapshot.fillPct = fillPct;
    snapshot.distanceCm = echoSeenInWindow ? filteredCm : -1.0f;
    snapshot.overflow = binFull;
    snapshot.gasRaw = gasValue;
    snapshot.peopleCount = lastPeopleCount;
    snapshot.movementAlert = movementAlert;
    snapshot.mode = mode;
    xSemaphoreGive(snapshotMutex);
  }

  handleModeLED(mode);
  updateDisplay(distance, fillPct, gasValue, gasAlert, movementAlert, mode);

  // ---- Serial debug ----
  if (distance > 0) {
    Serial.print(F("Distance: "));
    Serial.print(distance, 1);
    Serial.print(F(" cm | "));
  } else {
    Serial.print(F("Distance: NO OBJECT | "));
  }
  Serial.print(F("Fill: "));
  Serial.print(fillPct, 0);
  Serial.print(F("% | Gas: "));
  Serial.print(gasValue);
  Serial.print(F(" | People: "));
  Serial.print(peopleCount);
  Serial.print(F(" | Traffic: "));
  Serial.print(lastTrafficHigh ? F("HIGH") : F("NORMAL"));
  // NEW — accelerometer fields appended to the existing line, same style
  Serial.print(F(" | X: "));
  Serial.print(lastAccelX, 2);
  Serial.print(F(" | Y: "));
  Serial.print(lastAccelY, 2);
  Serial.print(F(" | Z: "));
  Serial.print(lastAccelZ, 2);
  Serial.print(F(" | Movement: "));
  Serial.print(movementAlert ? F("POSSIBLE THEFT") : F("NORMAL"));
  Serial.print(F(" | Mode: "));
  Serial.print(modeName(mode));
  Serial.print(F(" | Link: "));
  Serial.println(!wifiConnected ? F("NO WIFI") : (lastPostOk ? F("LIVE") : F("API ERR")));

  delay(200); // paces sensor reads/display updates; short enough not to miss PIR events
}

// Triggers the ultrasonic sensor and measures the echo. Returns distance
// in centimetres, or NO_OBJECT_DISTANCE if no echo was received in time.
// A timed-out reading is never reported as a real distance.
float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, ULTRASONIC_TIMEOUT_US);

  if (duration == 0) {
    return NO_OBJECT_DISTANCE; // no echo -> no object detected, not "bin full"
  }

  return (duration * 0.0343f) / 2.0f;
}

// Raw ADC reading from the gas sensor's analog output. Not converted to
// ppm — GAS_THRESHOLD is only a prototype alert level based on the raw
// electrical reading, not a calibrated gas concentration.
int readGasLevel() {
  return analogRead(GAS_AO_PIN);
}

// True exactly once per LOW->HIGH transition on the PIR pin — a
// continuous HIGH (one person lingering) is one event, not hundreds.
bool isPersonDetected() {
  bool currentState = digitalRead(PIR_PIN);
  bool risingEdge = (currentState == HIGH && pirLastState == LOW);
  pirLastState = currentState;
  return risingEdge;
}

// Counts motion events into the current 10-second window, then rolls the
// window over once it expires, storing the result for display/reporting.
void updateTrafficCount() {
  if (isPersonDetected()) {
    peopleCount++;
  }

  if (millis() - trafficWindowStart >= TRAFFIC_INTERVAL) {
    lastPeopleCount = peopleCount;
    lastTrafficHigh = (lastPeopleCount > TRAFFIC_THRESHOLD);
    peopleCount = 0;
    trafficWindowStart = millis();
  }
}

// Non-blocking LED pattern per mode, so each state is recognisable at a
// glance from across the street:
//   NORMAL off | MAINTENANCE slow blink (1 s) | EMERGENCY fast blink (150 ms)
void handleModeLED(DeviceMode mode) {
  if (mode == MODE_NORMAL) {
    digitalWrite(LED_PIN, LOW);
    ledState = false;
    return;
  }

  unsigned long interval = (mode == MODE_MAINTENANCE) ? LED_MAINTENANCE_INTERVAL_MS : LED_EMERGENCY_INTERVAL_MS;
  unsigned long now = millis();
  if (now - lastLedToggle >= interval) {
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    lastLedToggle = now;
  }
}

// Same priority as the backend's derive_mode(): a gas hazard is always an
// emergency; otherwise the technician's maintenance switch wins over
// tamper/overflow (servicing a bin trips both); otherwise tamper or a
// critically full bin is an emergency.
DeviceMode computeMode(bool gasAlert, bool movementAlert, float fillPct) {
  if (gasAlert) return MODE_EMERGENCY;
  if (maintenanceSwitch) return MODE_MAINTENANCE;
  if (movementAlert || fillPct >= FILL_CRITICAL_PCT) return MODE_EMERGENCY;
  return MODE_NORMAL;
}

const char* modeName(DeviceMode mode) {
  switch (mode) {
    case MODE_MAINTENANCE: return "maintenance";
    case MODE_EMERGENCY:   return "emergency";
    default:               return "normal";
  }
}

// Debounced toggle on the BOOT button's press (HIGH -> LOW).
void pollModeButton() {
  bool raw = digitalRead(MODE_BUTTON_PIN);
  unsigned long now = millis();
  if (raw != buttonLastRaw) {
    buttonLastRaw = raw;
    buttonChangedAt = now;
  }
  if (now - buttonChangedAt >= BUTTON_DEBOUNCE_MS && raw != buttonStable) {
    buttonStable = raw;
    if (buttonStable == LOW) {
      maintenanceSwitch = !maintenanceSwitch;
      Serial.print(F("Maintenance switch: "));
      Serial.println(maintenanceSwitch ? F("ON") : F("OFF"));
    }
  }
}

// Median of the last FILL_FILTER_SAMPLES distance readings. A missing echo
// counts as "empty" (BIN_EMPTY_DISTANCE) rather than being dropped — same
// meaning as before: no echo means nothing close, not "bin full".
float filteredDistance(float rawDistance) {
  bool hasEcho = rawDistance > 0;
  float v = hasEcho ? min(rawDistance, BIN_EMPTY_DISTANCE) : BIN_EMPTY_DISTANCE;
  distSamples[distSampleNext] = hasEcho ? v : -v;   // sign marks "no echo" for echoSeenInWindow below
  distSampleNext = (distSampleNext + 1) % FILL_FILTER_SAMPLES;
  if (distSampleCount < FILL_FILTER_SAMPLES) distSampleCount++;

  float sorted[FILL_FILTER_SAMPLES];
  echoSeenInWindow = false;
  for (int i = 0; i < distSampleCount; i++) {
    if (distSamples[i] > 0) echoSeenInWindow = true;
    sorted[i] = fabs(distSamples[i]);
  }
  for (int i = 1; i < distSampleCount; i++) {          // insertion sort, N is tiny
    float key = sorted[i];
    int j = i - 1;
    while (j >= 0 && sorted[j] > key) { sorted[j + 1] = sorted[j]; j--; }
    sorted[j + 1] = key;
  }
  return sorted[distSampleCount / 2];
}

// 0% at BIN_EMPTY_DISTANCE, 100% at FULL_DISTANCE.
float fillPercent(float distanceCm) {
  float pct = (BIN_EMPTY_DISTANCE - distanceCm) / (BIN_EMPTY_DISTANCE - FULL_DISTANCE) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

// ---------------- Networking ----------------

// POSTs one reading to PUBLIC_API_URL/api/devices/{DEVICE_SLUG}/readings.
// Returns true on a 2xx. Runs only on the network task.
bool postReading(const Snapshot& snap) {
  String url = String(PUBLIC_API_URL);
  while (url.endsWith("/")) url.remove(url.length() - 1);
  url += "/api/devices/";
  url += DEVICE_SLUG;
  url += "/readings";

  char distance[32] = "";
  if (snap.distanceCm >= 0) snprintf(distance, sizeof(distance), "\"distance_cm\":%.1f,", snap.distanceCm);

  char body[320];
  snprintf(body, sizeof(body),
           "{\"uptime_s\":%lu,\"fill_pct\":%.1f,%s\"overflow_flag\":%s,\"gas_raw\":%d,"
           "\"people_count\":%d,\"movement_alert\":%s,\"mode\":\"%s\"}",
           millis() / 1000UL, snap.fillPct, distance, snap.overflow ? "true" : "false", snap.gasRaw,
           snap.peopleCount, snap.movementAlert ? "true" : "false", modeName(snap.mode));

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient plainClient;
  bool useTls = url.startsWith("https://");
  bool began;
  if (useTls) {
    // Skips certificate validation: fine for a demo tunnel, not for
    // production — pin the CA (setCACert) before any real deployment.
    secureClient.setInsecure();
    began = http.begin(secureClient, url);
  } else {
    began = http.begin(plainClient, url);
  }
  if (!began) return false;

  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "1");  // ngrok's free tier otherwise answers with an HTML interstitial

  int code = http.POST((uint8_t*)body, strlen(body));
  Serial.printf("[net] POST %s -> %d\n", url.c_str(), code);
  http.end();
  return code >= 200 && code < 300;
}

// Keeps wifi up and sends a reading every POST_INTERVAL_MS — and straight
// away whenever the mode changes, since the city wants status on toggles.
void networkTask(void* arg) {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setHostname(DEVICE_SLUG);

  if (strlen(WIFI_SSID) == 0 || strlen(PUBLIC_API_URL) == 0) {
    Serial.println(F("[net] WIFI_SSID / PUBLIC_API_URL not set — fill in .env and rebuild. Networking disabled."));
    vTaskDelete(NULL);
  }

  unsigned long lastBegin = 0;
  unsigned long nextPostAt = 0;
  DeviceMode lastPostedMode = MODE_NORMAL;
  unsigned long lastPostAt = 0;
  bool everPosted = false;

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      unsigned long now = millis();
      if (lastBegin == 0 || now - lastBegin >= WIFI_RETRY_MS) {
        Serial.printf("[net] connecting to wifi '%s'...\n", WIFI_SSID);
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        lastBegin = now;
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    if (!wifiConnected) {
      wifiConnected = true;
      Serial.print(F("[net] wifi up, ip "));
      Serial.println(WiFi.localIP());
      nextPostAt = millis();   // first reading right after connecting = the "online" handshake
    }

    Snapshot snap;
    if (xSemaphoreTake(snapshotMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      snap = snapshot;
      xSemaphoreGive(snapshotMutex);

      unsigned long now = millis();
      bool modeChanged = everPosted && snap.mode != lastPostedMode && now - lastPostAt >= MODE_CHANGE_MIN_GAP_MS;
      if (now >= nextPostAt || modeChanged) {
        lastPostOk = postReading(snap);
        lastPostAt = millis();
        everPosted = true;
        if (lastPostOk) lastPostedMode = snap.mode;
        nextPostAt = lastPostAt + (lastPostOk ? POST_INTERVAL_MS : POST_RETRY_MS);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(250));
  }
}

// ---------------- Accelerometer / movement detection (NEW) ----------------

// Averages BASELINE_SAMPLE_COUNT readings to establish what "stationary"
// looks like for this bin at startup. Called once from setup(), only if
// the accelerometer was detected.
void calibrateAccelBaseline() {
  float sumX = 0, sumY = 0, sumZ = 0;

  for (int i = 0; i < BASELINE_SAMPLE_COUNT; i++) {
    sensors_event_t event;
    accel.getEvent(&event);
    sumX += event.acceleration.x;
    sumY += event.acceleration.y;
    sumZ += event.acceleration.z;
    delay(50);
  }

  baselineAccelX = sumX / BASELINE_SAMPLE_COUNT;
  baselineAccelY = sumY / BASELINE_SAMPLE_COUNT;
  baselineAccelZ = sumZ / BASELINE_SAMPLE_COUNT;
}

// Reads the accelerometer and returns true only once the deviation from
// the stationary baseline has stayed above MOVEMENT_THRESHOLD_MS2 for
// MOVEMENT_CONSECUTIVE_READINGS in a row. This is deliberately not a
// single-spike trigger — sensor noise, small bumps, vibration, or someone
// briefly touching the bin should not read as "possible theft". The
// accelerometer can only report unusual movement, never confirm theft,
// which is why both the OLED and Serial wording stay hedged.
bool detectAbnormalMovement() {
  if (!accelAvailable) return false;

  sensors_event_t event;
  accel.getEvent(&event);
  lastAccelX = event.acceleration.x;
  lastAccelY = event.acceleration.y;
  lastAccelZ = event.acceleration.z;

  float deltaX = fabs(lastAccelX - baselineAccelX);
  float deltaY = fabs(lastAccelY - baselineAccelY);
  float deltaZ = fabs(lastAccelZ - baselineAccelZ);
  float deltaMagnitude = sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);

  if (deltaMagnitude >= MOVEMENT_THRESHOLD_MS2) {
    movementExceedStreak++;
  } else {
    movementExceedStreak = 0;
  }

  return movementExceedStreak >= MOVEMENT_CONSECUTIVE_READINGS;
}

// Renders the current status to the OLED, in priority order:
//   1. Gas alert   2. Maintenance   3. Possible theft / movement
//   4. Bin full (fill >= FILL_CRITICAL_PCT)   5. Medium (>= FILL_WARNING_PCT)
//   6. Bin not full (also shown when there is no echo)
// The bottom two lines are always shown: mode + link state, and traffic —
// separate measurements from the bin's own state.
void updateDisplay(float distance, float fillPct, int gasValue, bool gasAlert, bool movementAlert, DeviceMode mode) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (gasAlert) {
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(F("GAS ALERT!"));
    display.setTextSize(1);
    display.setCursor(0, 20);
    display.print(F("Gas Level: "));
    display.println(gasValue);
  } else if (mode == MODE_MAINTENANCE) {
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(F("SERVICE"));
    display.println(F("MODE"));
    display.setTextSize(1);
    display.setCursor(0, 36);
    display.println(F("Alerts paused"));
  } else if (movementAlert) {
    // Priority 3, between maintenance and bin-full.
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(F("MOVEMENT"));
    display.println(F("ALERT!"));
    display.setTextSize(1);
    display.setCursor(0, 36);
    display.println(F("POSSIBLE THEFT"));
  } else if (fillPct >= FILL_CRITICAL_PCT) {
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(F("BIN FULL"));
    display.setCursor(0, 20);
    display.println(F("WARNING!"));
  } else {
    // Medium, or not full. No valid echo is treated as "not full", never
    // shown as a fabricated distance.
    display.setTextSize(1);
    display.setCursor(0, 10);
    display.println(fillPct >= FILL_WARNING_PCT ? F("MEDIUM CAPACITY") : F("BIN NOT FULL"));
    display.setCursor(0, 24);
    display.print(F("Fill: "));
    display.print(fillPct, 0);
    display.println(F("%"));
  }

  display.setTextSize(1);
  display.setCursor(0, 46);
  display.print(F("MODE:"));
  display.print(mode == MODE_MAINTENANCE ? F("MAINT") : (mode == MODE_EMERGENCY ? F("EMERG") : F("NORMAL")));
  display.print(F("  "));
  display.println(!wifiConnected ? F("NO WIFI") : (lastPostOk ? F("LIVE") : F("API ERR")));
  display.setCursor(0, 56);
  display.print(F("Traffic:"));
  display.print(lastPeopleCount);
  display.print(F("/10s "));
  display.println(lastTrafficHigh ? F("HIGH") : F("NORM"));

  display.display();
}

/*
  Smart Bin Monitoring — ESP32 + Arduino IDE

  Four independent subsystems, kept deliberately separate:
    1. Ultrasonic sensor  -> bin fill level
    2. PIR sensor         -> estimated people traffic near the bin
    3. Gas sensor         -> hazard warning
    4. Accelerometer      -> unusual movement / possible theft warning

  All four feed a single OLED display, which shows whichever has the
  highest priority right now (gas > movement > bin full > medium > not
  full), plus the traffic reading underneath. A high-traffic reading does
  NOT mean the bin is full, and a movement alert does NOT mean theft has
  definitely occurred — they are independent, best-effort measurements
  shown together.

  Network: the ESP32 joins wifi and POSTs a JSON reading to the Streetwise
  API (the ngrok URL below) every 30 s. The backend relays summary metrics to
  the city mainframe — this device never talks to the city directly.
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

// Wifi + HTTP(S) — built into the ESP32 Arduino core, nothing to install.
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ---------- Network settings — EDIT THESE ----------
// Don't commit your real wifi password.
#define WIFI_SSID       "your-2.4GHz-wifi"   // the ESP32 can only join 2.4 GHz networks
#define WIFI_PASSWORD   "your-wifi-password"
#define API_BASE_URL    "https://unoperating-natashia-ensuingly.ngrok-free.dev"  // no trailing slash
#define DEVICE_ID       "bin-01"             // must match the backend: bin-01, bin-02 or bin-03
// Readings go to:  API_BASE_URL/api/devices/DEVICE_ID/readings

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

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

// ---------- Thresholds (named, never hard-coded below) ----------
#define FULL_DISTANCE       3.0f   // cm — at or below this, bin is full
#define MEDIUM_DISTANCE     8.0f   // cm — at or below this, medium capacity
#define NOT_FULL_DISTANCE 14.0f   // cm — at or below this, waste present but not full
#define GAS_THRESHOLD       800    // raw ADC reading — prototype alert threshold, not a ppm value

#define TRAFFIC_INTERVAL  10000UL  // ms — length of one traffic observation window
#define TRAFFIC_THRESHOLD     5    // events per window — above this is "high traffic"

#define ULTRASONIC_TIMEOUT_US 30000UL // pulseIn timeout, so a missing echo can't hang the loop
#define NO_OBJECT_DISTANCE    -1.0f   // internal marker meaning "no echo received" — never shown as a real distance

#define LED_FLASH_INTERVAL_MS 150UL

// ---------- Network timing ----------
#define POST_INTERVAL_MS    30000UL  // send a reading this often (the city protocol wants 30 s)
#define POST_RETRY_MS       10000UL  // after a failed send, try again sooner than 30 s
#define WIFI_RETRY_MS       15000UL  // re-issue WiFi.begin() if still not connected after this
#define HTTP_TIMEOUT_MS      3000UL  // a dead connection can only pause the loop this long
#define ECHO_STALE_MS        5000UL  // no valid echo for this long -> treat the bin as empty

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

// ---------- Accelerometer / movement state (NEW) ----------
bool accelAvailable = false;        // true once the accelerometer is detected in setup()
float baselineAccelX = 0, baselineAccelY = 0, baselineAccelZ = 0; // "stationary" reference, set once at startup
float lastAccelX = 0, lastAccelY = 0, lastAccelZ = 0;             // most recent reading, for Serial/display
int movementExceedStreak = 0;       // consecutive loop iterations the delta has exceeded the threshold

// ---------- Network state ----------
unsigned long lastWifiAttempt = 0;
unsigned long nextPostAt = 0;       // millis() time of the next send; 0 = as soon as wifi is up
bool lastPostOk = false;
float lastValidDistance = NOT_FULL_DISTANCE; // last real echo, so one missed echo can't read as "empty"
unsigned long lastValidAt = 0;

// ---------- Function declarations ----------
float readUltrasonicDistance();
int readGasLevel();
bool isPersonDetected();
void updateTrafficCount();
void updateDisplay(float distance, int gasValue, bool gasAlert, bool movementAlert);
void handleWarningLED(bool binFull, bool gasAlert, bool movementAlert);
void calibrateAccelBaseline();       // NEW
bool detectAbnormalMovement();       // NEW
void startWifi();
void maintainWifi();
float fillPercent(float distanceCm);
bool postReading(float fillPct, float distanceCm, bool overflow, int gasValue, int people, bool movement);
void sendReadingIfDue(bool binFull, int gasValue, bool movementAlert);

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(PIR_PIN, INPUT);
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

  // Wifi connects in the background; the sensors and display don't wait for it.
  startWifi();

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
}

void loop() {
  float distance = readUltrasonicDistance();
  int gasValue = readGasLevel();
  bool gasAlert = (gasValue >= GAS_THRESHOLD);
  bool movementAlert = detectAbnormalMovement(); // NEW

  updateTrafficCount();

  bool hasObject = (distance > 0);
  bool binFull = hasObject && (distance <= FULL_DISTANCE);
  if (hasObject) {
    lastValidDistance = distance;
    lastValidAt = millis();
  }

  handleWarningLED(binFull, gasAlert, movementAlert);
  updateDisplay(distance, gasValue, gasAlert, movementAlert);

  // ---- Serial debug ----
  if (hasObject) {
    Serial.print(F("Distance: "));
    Serial.print(distance, 1);
    Serial.print(F(" cm | "));
  } else {
    Serial.print(F("Distance: NO OBJECT | "));
  }
  Serial.print(F("Gas: "));
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
  Serial.println(movementAlert ? F("POSSIBLE THEFT") : F("NORMAL"));

  maintainWifi();
  sendReadingIfDue(binFull, gasValue, movementAlert);

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

// Non-blocking LED flash while a warning is active (gas, movement, or
// bin full). LED stays off during normal operation — unchanged from
// before, just with movementAlert added as another trigger.
void handleWarningLED(bool binFull, bool gasAlert, bool movementAlert) {
  bool warningActive = binFull || gasAlert || movementAlert;

  if (!warningActive) {
    digitalWrite(LED_PIN, LOW);
    ledState = false;
    return;
  }

  unsigned long now = millis();
  if (now - lastLedToggle >= LED_FLASH_INTERVAL_MS) {
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    lastLedToggle = now;
  }
}

// ---------------- Network ----------------

// Prints WHY wifi dropped or failed — the usual culprits are in the message.
// Runs on the wifi task, so it only prints.
void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.print(F("[net] wifi connected, IP "));
      Serial.println(WiFi.localIP());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.print(F("[net] wifi disconnected, reason "));
      Serial.print(info.wifi_sta_disconnected.reason);
      switch (info.wifi_sta_disconnected.reason) {
        case 201: Serial.println(F(" = network not found (wrong SSID, out of range, or a 5 GHz-only network)")); break;
        case 202:
        case 15:  Serial.println(F(" = authentication failed (wrong password?)")); break;
        case 205: Serial.println(F(" = connection failed")); break;
        default:  Serial.println(); break;
      }
      break;
    default:
      break;
  }
}

// Starts wifi without waiting for it: the sensors and OLED keep running.
void startWifi() {
  WiFi.onEvent(onWifiEvent);
  WiFi.persistent(false);        // don't wear the flash rewriting credentials on every boot
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);          // modem sleep makes the ESP32 drop out and answer slowly
  WiFi.setAutoReconnect(true);
  Serial.print(F("[net] connecting to wifi '"));
  Serial.print(WIFI_SSID);
  Serial.println(F("'..."));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
}

// If wifi is still down after WIFI_RETRY_MS, restart the connection attempt
// from scratch (a stuck half-connected state is common on busy event wifi).
void maintainWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiAttempt < WIFI_RETRY_MS) return;

  Serial.println(F("[net] wifi still down - restarting the connection attempt"));
  WiFi.disconnect(true);         // true = also switch the radio off, for a clean restart
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
}

// 0% at NOT_FULL_DISTANCE (or no echo), 100% at FULL_DISTANCE — the same
// two distances the OLED uses, so the dashboard and the display agree.
float fillPercent(float distanceCm) {
  float pct = (NOT_FULL_DISTANCE - distanceCm) / (NOT_FULL_DISTANCE - FULL_DISTANCE) * 100.0f;
  return constrain(pct, 0.0f, 100.0f);
}

// Sends one JSON reading to the API. Returns true on a 2xx response.
// distanceCm < 0 means "no recent echo": the field is left out, never faked.
// Note: this blocks for the length of the request (typically well under a
// second; at most about HTTP_TIMEOUT_MS if the connection is dead).
bool postReading(float fillPct, float distanceCm, bool overflow, int gasValue, int people, bool movement) {
  String url = String(API_BASE_URL) + "/api/devices/" + DEVICE_ID + "/readings";

  char distanceField[32] = "";
  if (distanceCm >= 0) snprintf(distanceField, sizeof(distanceField), "\"distance_cm\":%.1f,", distanceCm);

  char body[256];
  snprintf(body, sizeof(body),
           "{\"uptime_s\":%lu,\"fill_pct\":%.1f,%s\"overflow_flag\":%s,\"gas_raw\":%d,"
           "\"people_count\":%d,\"movement_alert\":%s}",
           millis() / 1000UL, fillPct, distanceField, overflow ? "true" : "false", gasValue,
           people, movement ? "true" : "false");

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient plainClient;
  bool began;
  if (url.startsWith("https://")) {
    // Skips certificate checking — fine for a demo tunnel, not for production.
    secureClient.setInsecure();
    began = http.begin(secureClient, url);
  } else {
    began = http.begin(plainClient, url);   // plain http://, e.g. the laptop's LAN address
  }
  if (!began) return false;

  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "1");   // ngrok's free tier otherwise answers with an HTML warning page

  int code = http.POST((uint8_t*)body, strlen(body));
  Serial.print(F("[net] POST "));
  Serial.print(url);
  Serial.print(F(" -> "));
  Serial.println(code);   // 202 = accepted; negative = couldn't connect
  http.end();
  return code >= 200 && code < 300;
}

// Called every loop; sends a reading when one is due and wifi is up.
void sendReadingIfDue(bool binFull, int gasValue, bool movementAlert) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() < nextPostAt) return;

  bool echoRecent = (millis() - lastValidAt) < ECHO_STALE_MS;
  float distanceCm = echoRecent ? lastValidDistance : -1.0f;
  float fillPct = echoRecent ? fillPercent(lastValidDistance) : 0.0f;   // no echo = nothing close = empty

  lastPostOk = postReading(fillPct, distanceCm, binFull, gasValue, lastPeopleCount, movementAlert);
  nextPostAt = millis() + (lastPostOk ? POST_INTERVAL_MS : POST_RETRY_MS);
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
//   1. Gas alert   2. Possible theft / movement   3. Bin full
//   4. Medium capacity   5. Bin not full   6. No object detected (also
//   shown as "not full")
// Traffic info is always shown underneath — it's a separate measurement.
void updateDisplay(float distance, int gasValue, bool gasAlert, bool movementAlert) {
  bool hasObject = (distance > 0);

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // if (gasAlert) {
  //   display.setTextSize(2);
  //   display.setCursor(0, 0);
  //   display.println(F("GAS ALERT!"));
  //   display.setTextSize(1);
  //   display.setCursor(0, 20);
  //   display.print(F("Gas Level: "));
  //   display.println(gasValue);
  if (movementAlert) {
    // NEW — priority 2, between gas and bin-full per spec.
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(F("MOVEMENT"));
    display.println(F("ALERT!"));
    display.setTextSize(1);
    display.setCursor(0, 36);
    display.println(F("POSSIBLE THEFT"));
  } else if (hasObject && distance <= FULL_DISTANCE) {
    display.setTextSize(2);
    display.setCursor(0, 0);
    display.println(F("BIN FULL"));
    display.setCursor(0, 20);
    display.println(F("WARNING!"));
  } else if (hasObject && distance <= MEDIUM_DISTANCE) {
    display.setTextSize(1);
    display.setCursor(0, 10);
    display.println(F("MEDIUM CAPACITY"));
  } else if (hasObject && distance <= NOT_FULL_DISTANCE) {
    display.setTextSize(1);
    display.setCursor(0, 10);
    display.println(F("BIN EMPTY"));
  } else {
    // No valid echo (or a reading beyond NOT_FULL_DISTANCE) — treated as
    // "not full", never shown as a fabricated distance.
    display.setTextSize(1);
    display.setCursor(0, 10);
    display.println(F("BIN EMPTY"));
  }

  // Show only the dumping prohibition notice; no traffic amount or status.
  display.setTextSize(1);
  display.setCursor(0, 52);
  display.println(F("DUMPING PROHIBITED"));

  display.display();
}

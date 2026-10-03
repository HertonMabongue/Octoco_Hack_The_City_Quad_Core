/*
  Smart Bin Monitoring — ESP32 + Arduino IDE

  Three independent subsystems, kept deliberately separate:
    1. Ultrasonic sensor  -> bin fill level
    2. PIR sensor         -> estimated people traffic near the bin
    3. Gas sensor         -> hazard warning

  All three feed a single OLED display, which shows whichever has the
  highest priority right now (gas > bin full > medium > not full), plus
  the traffic reading underneath. A high-traffic reading does NOT mean
  the bin is full — they are unrelated measurements shown together.
*/

#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

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

#define SCREEN_WIDTH  128
#define SCREEN_HEIGHT 64

// ---------- Thresholds (named, never hard-coded below) ----------
#define FULL_DISTANCE       3.0f   // cm — at or below this, bin is full
#define MEDIUM_DISTANCE     8.0f   // cm — at or below this, medium capacity
#define NOT_FULL_DISTANCE  15.0f   // cm — at or below this, waste present but not full
#define GAS_THRESHOLD       800    // raw ADC reading — prototype alert threshold, not a ppm value

#define TRAFFIC_INTERVAL  10000UL  // ms — length of one traffic observation window
#define TRAFFIC_THRESHOLD     5    // events per window — above this is "high traffic"

#define ULTRASONIC_TIMEOUT_US 30000UL // pulseIn timeout, so a missing echo can't hang the loop
#define NO_OBJECT_DISTANCE    -1.0f   // internal marker meaning "no echo received" — never shown as a real distance

#define LED_FLASH_INTERVAL_MS 150UL

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, OLED_MOSI, OLED_SCK, OLED_DC, OLED_RESET, OLED_CS);

// ---------- PIR / traffic state ----------
bool pirLastState = LOW;        // previous PIR reading, to detect LOW->HIGH transitions
int peopleCount = 0;            // events counted in the current window
unsigned long trafficWindowStart = 0;
int lastPeopleCount = 0;        // events counted in the most recently completed window (what's displayed)
bool lastTrafficHigh = false;   // classification for the most recently completed window

// ---------- LED flash state ----------
unsigned long lastLedToggle = 0;
bool ledState = false;

// ---------- Function declarations ----------
float readUltrasonicDistance();
int readGasLevel();
bool isPersonDetected();
void updateTrafficCount();
void updateDisplay(float distance, int gasValue, bool gasAlert);
void handleWarningLED(bool binFull, bool gasAlert);

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
}

void loop() {
  float distance = readUltrasonicDistance();
  int gasValue = readGasLevel();
  bool gasAlert = (gasValue >= GAS_THRESHOLD);

  updateTrafficCount();

  bool hasObject = (distance > 0);
  bool binFull = hasObject && (distance <= FULL_DISTANCE);

  handleWarningLED(binFull, gasAlert);
  updateDisplay(distance, gasValue, gasAlert);

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
  Serial.println(lastTrafficHigh ? F("HIGH") : F("NORMAL"));

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

// Non-blocking LED flash while a warning is active (gas or bin full).
// LED stays off during normal operation.
void handleWarningLED(bool binFull, bool gasAlert) {
  bool warningActive = binFull || gasAlert;

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

// Renders the current status to the OLED, in priority order:
//   1. Gas alert       2. Bin full       3. Medium capacity
//   4. Bin not full     5. No object detected (also shown as "not full")
// Traffic info is always shown underneath — it's a separate measurement.
void updateDisplay(float distance, int gasValue, bool gasAlert) {
  bool hasObject = (distance > 0);

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
    display.println(F("BIN NOT FULL"));
  } else {
    // No valid echo (or a reading beyond NOT_FULL_DISTANCE) — treated as
    // "not full", never shown as a fabricated distance.
    display.setTextSize(1);
    display.setCursor(0, 10);
    display.println(F("BIN NOT FULL"));
  }

  display.setTextSize(1);
  display.setCursor(0, 46);
  display.print(F("Traffic: "));
  display.print(lastPeopleCount);
  display.println(F("/10s"));
  display.setCursor(0, 56);
  display.println(lastTrafficHigh ? F("HIGH TRAFFIC") : F("NORMAL TRAFFIC"));

  display.display();
}

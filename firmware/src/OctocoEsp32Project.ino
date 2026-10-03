#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// Hardware Pin Definitions
#define TRIG_PIN 5
#define ECHO_PIN 18
#define LED_PIN  13

// OLED SPI Pin Definitions
#define OLED_SCK   22
#define OLED_MOSI  23
#define OLED_RESET 16
#define OLED_DC    17
#define OLED_CS    -1

// Distance Thresholds (in cm)
#define WARNING_DISTANCE 3.0
#define MEDIUM_DISTANCE  10.0

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, OLED_MOSI, OLED_SCK, OLED_DC, OLED_RESET, OLED_CS);

float readUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999.0;
  
  float distanceCm = duration * 0.0343 / 2.0;
  return distanceCm;
}

void setup() {
  Serial.begin(115200);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // OLED Hardware Reset Pulse
  pinMode(OLED_RESET, OUTPUT);
  digitalWrite(OLED_RESET, LOW);
  delay(10);
  digitalWrite(OLED_RESET, HIGH);
  delay(10);

  if(!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println(F("OLED Allocation Failed - Check SPI Wiring"));
    for(;;);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(F("System Monitoring..."));
  display.display();
  delay(1000);
}

void loop() {
  float distance = readUltrasonicDistance();
  
  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");

  // State 1: Within 3 cm -> Warning & Toggling LED
  if (distance > 0 && distance <= WARNING_DISTANCE) {
    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(0, 5);
    display.println(F("WARNING!"));
    display.setTextSize(1);
    display.setCursor(0, 30);
    display.println(F("Too Close!"));
    display.print(F("Dist: "));
    display.print(distance, 1);
    display.println(F(" cm"));
    display.display();

    // Toggle LED 3 times quickly
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }

  // State 2: Between 3 cm and 10 cm -> Medium Capacity
  } else if (distance > WARNING_DISTANCE && distance <= MEDIUM_DISTANCE) {
    digitalWrite(LED_PIN, LOW);

    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 10);
    display.println(F("Status:"));
    display.setTextSize(1);
    display.setCursor(0, 25);
    display.println(F("Bin reached"));
    display.println(F("medium capacity"));
    display.setCursor(0, 48);
    display.print(F("Dist: "));
    display.print(distance, 1);
    display.println(F(" cm"));
    display.display();

    delay(200);

  // State 3: Further than 10 cm -> Bin Not Full
  } else {
    digitalWrite(LED_PIN, LOW);

    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 15);
    display.println(F("Status:"));
    display.setCursor(0, 30);
    display.println(F("Bin Not Full"));
    display.setCursor(0, 48);
    display.print(F("Dist: "));
    display.print(distance, 1);
    display.println(F(" cm"));
    display.display();

    delay(200);
  }
}
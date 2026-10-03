#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

// Pin Definitions
#define LED_PIN 13

// OLED SPI Pin Definitions
#define OLED_SCK   22
#define OLED_MOSI  23
#define OLED_RESET 16
#define OLED_DC    17
#define OLED_CS    -1  // Set to -1 since your OLED display doesn't have a CS pin

// Pass all 7 arguments (Width, Height, MOSI, SCK, DC, RESET, CS)
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, OLED_MOSI, OLED_SCK, OLED_DC, OLED_RESET, OLED_CS);

void setup() {
  Serial.begin(115200);

  // Configure LED pin
  pinMode(LED_PIN, OUTPUT);

  // Initialize OLED for SPI
  if(!display.begin(SSD1306_SWITCHCAPVCC)) {
    Serial.println(F("OLED Allocation Failed - Check SPI Wiring"));
  } else {
    Serial.println(F("OLED Initialized Successfully!"));
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 10);
    display.println(F("Testing OLED..."));
    display.display();
  }
}

void loop() {
  // Toggle LED ON
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED status: HIGH");
  delay(1000);

  // Toggle LED OFF
  digitalWrite(LED_PIN, LOW);
  Serial.println("LED status: LOW");
  delay(1000);
}
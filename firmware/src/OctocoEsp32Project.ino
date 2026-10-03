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
#define OLED_CS    -1  // Set to -1 since OLED board has no CS pin

// Distance Thresholds in centimeters
#define BIN_FULL_DISTANCE       10.0  // Object <= 10cm inside bin = Bin Full
#define DUMPING_DETECT_DISTANCE 50.0  // Object <= 50cm = Warning Triggered

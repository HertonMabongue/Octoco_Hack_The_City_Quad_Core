#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#ifndef WIFI_SSID
#define WIFI_SSID "your-ssid"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "your-password"
#endif
#ifndef MQTT_HOST
#define MQTT_HOST "broker.hivemq.com"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_TEAM
#define MQTT_TEAM "team-alpha"
#endif
#ifndef MQTT_DEVICE
#define MQTT_DEVICE "river-node-01"
#endif

static const int PIN_GAS = 34;
static const int PIN_PH = 35;
static const int PIN_ONEWIRE = 4;
static const int PIN_LED = 2;
static const int PIN_BUZZER = 15;

enum class DeviceMode { Normal, Maintenance, Emergency };

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature tempSensor(&oneWire);

DeviceMode mode = DeviceMode::Normal;
unsigned long lastTelemetryMs = 0;
unsigned long lastMaintenanceBuzzMs = 0;

String statusTopic() { return String("hack/") + MQTT_TEAM + "/" + MQTT_DEVICE + "/status"; }
String telemetryTopic() { return String("hack/") + MQTT_TEAM + "/" + MQTT_DEVICE + "/telemetry"; }
String modeTopic() { return String("hack/") + MQTT_TEAM + "/" + MQTT_DEVICE + "/mode"; }

const char *modeToString(DeviceMode value) {
  switch (value) {
    case DeviceMode::Maintenance: return "maintenance";
    case DeviceMode::Emergency: return "emergency";
    default: return "normal";
  }
}

float readGasPPM() {
  int raw = analogRead(PIN_GAS);
  return (raw / 4095.0f) * 1000.0f;
}

float readPH() {
  int raw = analogRead(PIN_PH);
  return 14.0f * (raw / 4095.0f);
}

float readTempC() {
  tempSensor.requestTemperatures();
  return tempSensor.getTempCByIndex(0);
}

void updateIndicators() {
  unsigned long now = millis();

  if (mode == DeviceMode::Normal) {
    digitalWrite(PIN_LED, ((now / 1000UL) % 2UL) ? HIGH : LOW);
    noTone(PIN_BUZZER);
  } else if (mode == DeviceMode::Maintenance) {
    digitalWrite(PIN_LED, HIGH);
    if (now - lastMaintenanceBuzzMs >= 5000UL) {
      tone(PIN_BUZZER, 1500, 100);
      lastMaintenanceBuzzMs = now;
    }
  } else {
    digitalWrite(PIN_LED, ((now / 200UL) % 2UL) ? HIGH : LOW);
    tone(PIN_BUZZER, 2200);
  }
}

void publishStatus(const char *status) {
  char payload[96];
  snprintf(payload, sizeof(payload), "{\"status\":\"%s\",\"mode\":\"%s\"}", status, modeToString(mode));
  mqttClient.publish(statusTopic().c_str(), payload, true);
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  String t(topic);
  if (t != modeTopic()) return;

  String incoming;
  incoming.reserve(length);
  for (unsigned int i = 0; i < length; i++) incoming += (char)payload[i];
  incoming.trim();
  incoming.toLowerCase();

  if (incoming == "normal") mode = DeviceMode::Normal;
  else if (incoming == "maintenance") mode = DeviceMode::Maintenance;
  else if (incoming == "emergency") mode = DeviceMode::Emergency;

  publishStatus("online");
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void ensureMQTT() {
  while (!mqttClient.connected()) {
    String clientId = String(MQTT_TEAM) + "-" + MQTT_DEVICE + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.connect(
      clientId.c_str(),
      nullptr,
      nullptr,
      statusTopic().c_str(),
      0,
      true,
      "{\"status\":\"offline\"}"
    );

    if (mqttClient.connected()) {
      mqttClient.subscribe(modeTopic().c_str());
      publishStatus("online");
    } else {
      delay(1000);
    }
  }
}

void setup() {
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  Serial.begin(115200);
  tempSensor.begin();
  ensureWiFi();
  ensureMQTT();
}

void loop() {
  ensureWiFi();
  ensureMQTT();
  mqttClient.loop();
  updateIndicators();

  unsigned long now = millis();
  if (now - lastTelemetryMs >= 30000UL) {
    lastTelemetryMs = now;

    float gas = readGasPPM();
    float temp = readTempC();
    float ph = readPH();
    unsigned long uptime = now / 1000UL;

    char payload[180];
    snprintf(
      payload,
      sizeof(payload),
      "{\"uptime_s\":%lu,\"gas_ppm\":%.2f,\"temp_c\":%.2f,\"ph\":%.2f}",
      uptime,
      gas,
      temp,
      ph
    );

    mqttClient.publish(telemetryTopic().c_str(), payload);
    Serial.println(payload);
  }
}

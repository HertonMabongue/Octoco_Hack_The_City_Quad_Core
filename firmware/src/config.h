// Everything that differs per deployment lives here or in the repo-root
// .env — never in the sketch. PlatformIO injects the .env values as
// compiler defines (load_env.py); Arduino IDE falls back to secrets.h.
// The #ifndef defaults only apply when neither provides a value.
#pragma once

#if __has_include("secrets.h")
#include "secrets.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef PUBLIC_API_URL
#define PUBLIC_API_URL ""        // e.g. https://your-name.ngrok-free.app
#endif
#ifndef DEVICE_SLUG
#define DEVICE_SLUG "bin-01"     // must exist in backend DEVICE_REGISTRY
#endif

// Shared with the backend (.env) so the OLED, the dashboard and the city
// board always agree on what "full" and "hazard" mean.
#ifndef FILL_WARNING_PCT
#define FILL_WARNING_PCT 60
#endif
#ifndef FILL_CRITICAL_PCT
#define FILL_CRITICAL_PCT 85
#endif
#ifndef GAS_ALERT_RAW
#define GAS_ALERT_RAW 800        // raw ADC reading, not a calibrated ppm value
#endif

// Network timing
#define POST_INTERVAL_MS       30000UL  // the city protocol wants a reading every 30 s
#define POST_RETRY_MS          10000UL  // after a failed POST, try again sooner than 30 s
#define MODE_CHANGE_MIN_GAP_MS  2000UL  // a mode flip is sent at once, but not faster than this
#define HTTP_TIMEOUT_MS         5000UL
#define WIFI_RETRY_MS          15000UL  // re-issue WiFi.begin() if still not connected after this

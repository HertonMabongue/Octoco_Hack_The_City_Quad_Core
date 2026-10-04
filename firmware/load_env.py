"""PlatformIO pre-build hook: turns the repo-root .env into compiler
defines, so the firmware is configured by the same file as the backend and
frontend. Only the keys the firmware needs are passed through; everything
else in .env (broker credentials, etc.) never reaches the binary.

Arduino IDE users: copy src/secrets.h.example to src/secrets.h instead.
"""
from pathlib import Path

Import("env")  # noqa: F821 — provided by PlatformIO's SCons

ENV_FILE = Path(env["PROJECT_DIR"]).parent / ".env"  # noqa: F821

STRING_KEYS = ["WIFI_SSID", "WIFI_PASSWORD", "PUBLIC_API_URL", "DEVICE_SLUG"]
NUMBER_KEYS = ["FILL_WARNING_PCT", "FILL_CRITICAL_PCT", "GAS_ALERT_RAW"]
REQUIRED = ["WIFI_SSID", "PUBLIC_API_URL"]


def read_env(path):
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


values = read_env(ENV_FILE)
if not values:
    print(f"load_env.py: WARNING no {ENV_FILE} found — copy .env.example to .env")

for key in STRING_KEYS:
    if values.get(key):
        env.Append(CPPDEFINES=[(key, env.StringifyMacro(values[key]))])  # noqa: F821
for key in NUMBER_KEYS:
    if values.get(key):
        env.Append(CPPDEFINES=[(key, values[key])])  # noqa: F821

missing = [k for k in REQUIRED if not values.get(k)]
if missing:
    print(f"load_env.py: WARNING {', '.join(missing)} empty in .env — the device will run but won't reach the API")
else:
    print(f"load_env.py: wifi '{values['WIFI_SSID']}' -> {values['PUBLIC_API_URL']} as {values.get('DEVICE_SLUG', 'bin-01')}")

#!/usr/bin/env bash
# Starts the backend (FastAPI + MQTT subscriber) and frontend (Next.js) together
# for local development. Ctrl+C stops both.
#
# Runs under any bash: native on macOS/Linux, or Git Bash/WSL on Windows.
# Native PowerShell/cmd on Windows cannot run a .sh file directly, use
# start.ps1 there instead (same steps, no bash required).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Picks whichever Python 3 is actually on PATH. Some systems (notably
# plain Windows Python installs) only expose "python", not "python3".
PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$candidate"
    break
  fi
done
if [ -z "$PYTHON_BIN" ]; then
  echo "==> No python3/python found on PATH. Install Python 3.11+ and re-run." >&2
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "==> Creating Python venv (.venv) with $PYTHON_BIN..."
  "$PYTHON_BIN" -m venv .venv
fi

# venv layout differs by platform: Scripts/ on a Windows-created venv
# (including one made from Git Bash), bin/ everywhere else.
if [ -f ".venv/bin/activate" ]; then
  VENV_BIN=".venv/bin"
elif [ -f ".venv/Scripts/activate" ]; then
  VENV_BIN=".venv/Scripts"
else
  echo "==> Could not find an activate script in .venv. Delete .venv and re-run." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$VENV_BIN/activate"
echo "==> Installing/checking backend dependencies..."
pip install -q -r backend/requirements.txt

if [ ! -d "frontend/node_modules" ]; then
  echo "==> Installing frontend dependencies (first run)..."
  (cd frontend && npm install)
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example. Edit it if you're off the venue network."
fi

if [ ! -f "frontend/.env.local" ] && [ -f "frontend/.env.local.example" ]; then
  cp frontend/.env.local.example frontend/.env.local
fi

set -a
# shellcheck disable=SC1091
[ -f ".env" ] && source .env
set +a

echo "==> Starting backend on :8000 and frontend on :3000"
# "python -m uvicorn" rather than the bare "uvicorn" command: it resolves
# through the venv's own interpreter regardless of whether the venv's
# script shims are on PATH, which is the part that differs most between
# platforms.
"$VENV_BIN/python" -m uvicorn main:app --reload --app-dir backend --port 8000 &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "==> Stopping backend and frontend..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait

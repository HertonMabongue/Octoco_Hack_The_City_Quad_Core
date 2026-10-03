#!/usr/bin/env bash
# Starts the backend (FastAPI + MQTT subscriber) and frontend (Next.js) together
# for local development. Ctrl+C stops both.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -d ".venv" ]; then
  echo "==> Creating Python venv (.venv)..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
echo "==> Installing/checking backend dependencies..."
pip install -q -r backend/requirements.txt

if [ ! -d "frontend/node_modules" ]; then
  echo "==> Installing frontend dependencies (first run)..."
  (cd frontend && npm install)
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example — edit it if you're off the venue network."
fi

if [ ! -f "frontend/.env.local" ] && [ -f "frontend/.env.local.example" ]; then
  cp frontend/.env.local.example frontend/.env.local
fi

set -a
# shellcheck disable=SC1091
[ -f ".env" ] && source .env
set +a

echo "==> Starting backend on :8000 and frontend on :3000"
uvicorn main:app --reload --app-dir backend --port 8000 &
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

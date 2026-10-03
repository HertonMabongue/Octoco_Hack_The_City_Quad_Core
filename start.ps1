# Starts the backend (FastAPI + MQTT subscriber) and frontend (Next.js)
# together for local development. Ctrl+C stops both.
#
# For native Windows PowerShell, no bash required. On macOS/Linux, or
# Windows with Git Bash/WSL, use start.sh instead (same steps).
#
# First run only, if scripts are blocked:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

$PythonBin = $null
foreach ($candidate in @("python", "python3", "py")) {
  if (Get-Command $candidate -ErrorAction SilentlyContinue) {
    $PythonBin = $candidate
    break
  }
}
if (-not $PythonBin) {
  Write-Error "No python/python3 found on PATH. Install Python 3.11+ and re-run."
  exit 1
}

if (-not (Test-Path ".venv")) {
  Write-Host "==> Creating Python venv (.venv) with $PythonBin..."
  & $PythonBin -m venv .venv
}

$VenvPython = Join-Path ".venv" "Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
  # A venv created from WSL/Git Bash on the same checkout uses the Unix layout.
  $VenvPython = Join-Path ".venv" "bin/python"
}
if (-not (Test-Path $VenvPython)) {
  Write-Error "Could not find a python executable in .venv. Delete .venv and re-run."
  exit 1
}

Write-Host "==> Installing/checking backend dependencies..."
& $VenvPython -m pip install -q -r backend/requirements.txt

if (-not (Test-Path "frontend/node_modules")) {
  Write-Host "==> Installing frontend dependencies (first run)..."
  Push-Location frontend
  npm install
  Pop-Location
}

if ((-not (Test-Path ".env")) -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "==> Created .env from .env.example. Edit it if you're off the venue network."
}

if ((-not (Test-Path "frontend/.env.local")) -and (Test-Path "frontend/.env.local.example")) {
  Copy-Item "frontend/.env.local.example" "frontend/.env.local"
}

if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
    $name, $value = $_ -split "=", 2
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
  }
}

Write-Host "==> Starting backend on :8000 and frontend on :3000"

$backend = Start-Process -FilePath $VenvPython `
  -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--app-dir", "backend", "--port", "8000" `
  -NoNewWindow -PassThru

$frontend = Start-Process -FilePath "npm" `
  -ArgumentList "run", "dev" `
  -WorkingDirectory (Join-Path $RootDir "frontend") `
  -NoNewWindow -PassThru

try {
  Wait-Process -Id $backend.Id, $frontend.Id
}
finally {
  Write-Host ""
  Write-Host "==> Stopping backend and frontend..."
  Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
}

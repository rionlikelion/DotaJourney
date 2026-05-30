# Stop dev servers and start API + frontend.
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

function Stop-PortListener {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $procId = $c.OwningProcess
        if ($procId -and $procId -ne 0) {
            Write-Host "Stopping process $procId on port $Port..."
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "=== Rion Dota Journey ===" -ForegroundColor Cyan
Write-Host "Stopping existing web servers (ports 8000, 5173)..."
Stop-PortListener -Port 8000
Stop-PortListener -Port 5173
Start-Sleep -Seconds 1

if (-not (Test-Path "config.json")) {
    Write-Host "ERROR: config.json not found. Copy config.example.json to config.json first." -ForegroundColor Red
    exit 1
}

Write-Host "`nStarting API and frontend with Node." -ForegroundColor Cyan
if (-not (Test-Path "$Root\node_modules")) {
    Write-Host "Installing workspace dependencies..."
    npm install --workspaces
}

Write-Host "Starting API (Node, http://127.0.0.1:8000)..."
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root'; npm run dev:server"
)

Write-Host "Starting frontend (http://localhost:5173)..."
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root'; npm run dev:frontend"
)

Write-Host "`nDone. Open http://localhost:5173 in your browser." -ForegroundColor Green

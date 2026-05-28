# Stop dev servers, sync matches, start API + frontend.
# Usage: .\start.ps1
#        .\start.ps1 -SkipSync

param(
    [switch]$SkipSync
)

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

if (-not $SkipSync) {
    Write-Host "`nSyncing matches..."
    python run_sync.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Sync failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} else {
    Write-Host "`nSkipping sync (-SkipSync)."
}

Write-Host "`nStarting API and frontend with Node. Python is only used for sync." -ForegroundColor Cyan
Write-Host "Starting API (Node, http://127.0.0.1:8000)..."
if (-not (Test-Path "$Root\server\node_modules")) {
    Write-Host "Installing server dependencies..."
    Set-Location "$Root\server"
    npm install
    Set-Location $Root
}
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root\server'; npm run dev"
)

Write-Host "Starting frontend (http://localhost:5173)..."
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Root\frontend'; npm run dev"
)

Write-Host "`nDone. Open http://localhost:5173 in your browser." -ForegroundColor Green

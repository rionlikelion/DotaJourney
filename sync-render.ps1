# Trigger match sync on the deployed Render site and print the result.
# Usage: .\sync-render.ps1
#        .\sync-render.ps1 -Force

param(
    [switch]$Force,
    [string]$Url = "https://riongardner.com/api/sync"
)

$ErrorActionPreference = "Stop"

if ($Force) {
    $separator = if ($Url -match '\?') { '&' } else { '?' }
    $Url = "$Url${separator}force=true"
}

Write-Host "=== Rion Dota Journey - Remote Sync ===" -ForegroundColor Cyan
Write-Host "POST $Url"
Write-Host "Sync may take a while; waiting for response...`n" -ForegroundColor DarkGray

try {
    $response = Invoke-WebRequest -Method POST -Uri $Url -TimeoutSec 3600 -UseBasicParsing
    $body = $response.Content | ConvertFrom-Json

    if ($body.ok) {
        Write-Host "Sync succeeded." -ForegroundColor Green
        Write-Host ""
        Write-Host ($body.message -replace '\r?\n', "`n")
    } else {
        Write-Host "Sync returned ok=false." -ForegroundColor Yellow
        Write-Host ($body | ConvertTo-Json -Depth 5)
    }
} catch {
    $web = $_.Exception.Response
    if ($web) {
        $reader = New-Object System.IO.StreamReader($web.GetResponseStream())
        $raw = $reader.ReadToEnd()
        $reader.Close()

        Write-Host "Sync failed (HTTP $([int]$web.StatusCode))." -ForegroundColor Red
        Write-Host ""

        try {
            $err = $raw | ConvertFrom-Json
            if ($err.detail) {
                Write-Host $err.detail
            } else {
                Write-Host ($err | ConvertTo-Json -Depth 5)
            }
        } catch {
            Write-Host $raw
        }
    } else {
        Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
try {
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
} catch {
    Read-Host "Press Enter to exit"
}

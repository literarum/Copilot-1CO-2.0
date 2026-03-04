# Сборка CRL-Helper для Windows
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/build-helper-windows.ps1
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
if (-not $Root) { $Root = (Get-Location).Path }
$DesktopHelper = Join-Path $Root 'desktop-helper'
$FilesDir = Join-Path $Root 'site' 'files'
$ExeOut = Join-Path $FilesDir 'CRL-Helper-windows.exe'

Write-Host 'Building CRL-Helper for Windows...' -ForegroundColor Cyan
Set-Location $DesktopHelper

python -m pip install -q -r requirements.txt
python -m PyInstaller --onefile --console --name CRL-Helper main.py

if (-not (Test-Path (Join-Path $DesktopHelper 'dist' 'CRL-Helper.exe'))) {
    Write-Host 'ERROR: PyInstaller did not produce CRL-Helper.exe' -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $FilesDir -Force | Out-Null
Copy-Item (Join-Path $DesktopHelper 'dist' 'CRL-Helper.exe') -Destination $ExeOut -Force
Write-Host "Created $ExeOut" -ForegroundColor Green

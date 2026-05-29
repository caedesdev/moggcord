# Downloads the latest Moggcord installer from GitHub and runs auto-install.
# Usage: powershell -ExecutionPolicy Bypass -File install-moggcord.ps1

$ErrorActionPreference = "Stop"
$repo = "caedesdev/moggcord"
$api = "https://api.github.com/repos/$repo/releases/latest"
$tmp = Join-Path $env:TEMP "Moggcord-Installer.exe"

Write-Host "Fetching latest Moggcord release..." -ForegroundColor Cyan
$release = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "Moggcord-Install-Script" }
$asset = $release.assets | Where-Object { $_.name -eq "Moggcord-Installer.exe" } | Select-Object -First 1
if (-not $asset) { throw "Moggcord-Installer.exe not found in latest release." }

Write-Host "Downloading $($release.tag_name)..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -UseBasicParsing

Write-Host "Installing into Discord (auto mode)..." -ForegroundColor Cyan
& $tmp --auto
exit $LASTEXITCODE

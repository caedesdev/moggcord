# ==============================================================================
#  Moggcord — Post-install injection (Inno Setup)
#  Safe to run multiple times: refreshes loader if already injected.
# ==============================================================================

param(
    [string]$AppDir = $PSScriptRoot
)

$ErrorActionPreference = "Continue"

$DiscordPath = Join-Path $env:LOCALAPPDATA "Discord"
if (-not (Test-Path $DiscordPath)) { exit 0 }

$LatestApp = Get-ChildItem $DiscordPath -Filter "app-*" | Sort-Object Name -Descending | Select-Object -First 1
if (-not $LatestApp) { exit 0 }

$CoreDir = Join-Path $LatestApp.FullName "resources"
$InjectDir = Join-Path $CoreDir "app"
$BackupAsar = Join-Path $CoreDir "_app.asar"
$AppAsar = Join-Path $CoreDir "app.asar"

$MoggcordPatcher = (Join-Path $AppDir "dist\desktop\patcher.js").Replace("\", "\\")

function Write-Loader {
    if (-not (Test-Path $InjectDir)) {
        New-Item -ItemType Directory -Path $InjectDir -Force | Out-Null
    }

    Set-Content -Path (Join-Path $InjectDir "package.json") -Value (@{ name = "discord"; main = "index.js" } | ConvertTo-Json) -Encoding UTF8

    $IndexJs = @"
"use strict";
const path = require("path");
const fs = require("fs");

try {
    require("$MoggcordPatcher");
} catch (e) {
    console.error("Moggcord injection failed:", e);
    const originalAsar = path.join(__dirname, "..", "_app.asar");
    if (fs.existsSync(originalAsar)) {
        require(originalAsar);
    }
}
"@

    Set-Content -Path (Join-Path $InjectDir "index.js") -Value $IndexJs -Encoding UTF8
}

# Already injected — refresh loader only, never touch _app.asar
if ((Test-Path $InjectDir) -and (Test-Path $BackupAsar) -and -not (Test-Path $AppAsar)) {
    Write-Loader
    exit 0
}

# First-time / repair: backup app.asar if still present
if ((Test-Path $AppAsar) -and -not (Test-Path $BackupAsar)) {
    $item = Get-Item $AppAsar -ErrorAction SilentlyContinue
    if ($item -and -not $item.PSIsContainer -and $item.Length -gt 1MB) {
        Rename-Item -Path $AppAsar -NewName "_app.asar"
    }
}

if (-not (Test-Path $BackupAsar)) {
    Write-Warning "Moggcord inject: _app.asar backup missing — reinstall Discord if inject fails."
}

Write-Loader
exit 0

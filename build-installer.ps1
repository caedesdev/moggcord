# build-installer.ps1 - Compile Moggcord-Installer.exe
# Usage: .\build-installer.ps1

$ErrorActionPreference = "Stop"
$Root   = $PSScriptRoot
$SrcDir = Join-Path $Root "installer-src"
$OutDir = Join-Path $Root "release\installer"
$OutExe = Join-Path $OutDir "Moggcord-Installer.exe"

Write-Host ""
Write-Host "  [Moggcord] Compiling installer..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Requires .NET 8 SDK (installer targets net8.0-windows; csc.exe cannot compile Program.cs)
$sdkLine = $null
try {
    $sdkLine = & dotnet --list-sdks 2>$null | Select-String "8\." | Select-Object -First 1
} catch { }

if (-not $sdkLine) {
    Write-Host "  [ERROR] .NET 8 SDK is required to build Moggcord-Installer.exe." -ForegroundColor Red
    Write-Host "          (The old csc.exe fallback does not support modern C# syntax.)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Install with winget:" -ForegroundColor Yellow
    Write-Host "    winget install Microsoft.DotNet.SDK.8" -ForegroundColor White
    Write-Host ""
    Write-Host "  Or download: https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Yellow
    Write-Host "  Then open a NEW terminal and run publish-release.bat again." -ForegroundColor Yellow
    exit 1
}

$sdkVersion = ($sdkLine -split "\s+")[0]
Write-Host "  [1/1] dotnet publish (SDK $sdkVersion)..." -ForegroundColor DarkGray

# Copy dist zip into installer-src if release zip exists (embedded resource)
$distZip = Join-Path $Root "release\installer\moggcord-dist.zip"
$embeddedZip = Join-Path $SrcDir "moggcord-dist.zip"
if ((Test-Path $distZip) -and -not (Test-Path $embeddedZip)) {
    Copy-Item $distZip $embeddedZip -Force
}

& dotnet publish "$SrcDir\MoggcordInstaller.csproj" `
    -c Release `
    -o $OutDir `
    --nologo `
    -v quiet `
    -p:PublishSingleFile=true `
    -p:SelfContained=false `
    -r win-x64

if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] dotnet publish failed." -ForegroundColor Red
    exit 1
}

$built = Get-ChildItem $OutDir -Recurse -Filter "Moggcord-Installer.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($built -and $built.FullName -ne $OutExe) {
    Copy-Item $built.FullName $OutExe -Force
}

# Result
if (Test-Path $OutExe) {
    $size = [math]::Round((Get-Item $OutExe).Length / 1KB, 0)
    Write-Host ""
    Write-Host "  OK  Moggcord-Installer.exe compiled ($size KB)" -ForegroundColor Green
    Write-Host "    -> $OutExe" -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host "  [ERROR] Moggcord-Installer.exe not found after compilation." -ForegroundColor Red
    exit 1
}

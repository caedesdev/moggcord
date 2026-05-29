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

# Always embed the freshest dist zip so offline installs still work as a fallback.
$distZip = Join-Path $Root "release\installer\moggcord-dist.zip"
$embeddedZip = Join-Path $SrcDir "moggcord-dist.zip"
$distDesktop = Join-Path $Root "dist\desktop"

if (-not (Test-Path $distZip) -and (Test-Path (Join-Path $distDesktop "patcher.js"))) {
    Write-Host "  [info] Building moggcord-dist.zip from dist\desktop..." -ForegroundColor DarkGray
    if (Test-Path $distZip) { Remove-Item $distZip -Force }
    Add-Type -Assembly System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        (Resolve-Path $distDesktop).Path,
        (Join-Path (Resolve-Path (Split-Path $distZip -Parent)).Path "moggcord-dist.zip"),
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
}

if (Test-Path $distZip) {
    Copy-Item $distZip $embeddedZip -Force
    Write-Host "  [info] Embedded dist zip refreshed for offline fallback." -ForegroundColor DarkGray
} elseif (Test-Path $embeddedZip) {
    Write-Host "  [warn] No fresh dist zip found; keeping existing embedded zip." -ForegroundColor Yellow
} else {
    Write-Host "  [ERROR] No moggcord-dist.zip to embed. Run pnpm build first." -ForegroundColor Red
    exit 1
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

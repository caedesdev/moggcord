@echo off
title Moggcord Installer - Build
cd /d "%~dp0"

echo.
echo  Building Moggcord Installer...
echo  ================================
echo.

dotnet publish installer-src\MoggcordInstaller.csproj ^
  -c Release ^
  -r win-x64 ^
  --self-contained false ^
  -p:PublishSingleFile=true ^
  -o installer-src\bin\publish

if %ERRORLEVEL% neq 0 (
    echo.
    echo  [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo  [OK] Build successful!
echo  Output: installer-src\bin\publish\Moggcord-Installer.exe
echo.

:: Ouvre le dossier de sortie
explorer installer-src\bin\publish

pause

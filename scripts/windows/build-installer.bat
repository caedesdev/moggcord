@echo off
title Moggcord Installer - Build
cd /d "%~dp0..\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build\windows-installer.ps1"
set "MOGGCORD_BUILD_RESULT=%errorlevel%"
if not "%MOGGCORD_BUILD_RESULT%"=="0" pause
exit /b %MOGGCORD_BUILD_RESULT%

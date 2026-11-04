@echo off
:: Wrapper .bat pour lancer moggcord-uninstall.ps1 facilement (double-clic)
title Moggcord — Désinstallation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0moggcord-uninstall.ps1"
if %errorlevel% neq 0 pause

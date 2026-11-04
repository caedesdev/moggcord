@echo off
:: Wrapper .bat pour lancer moggcord-install.ps1 facilement (double-clic)
title Moggcord — Installation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0moggcord-install.ps1"
if %errorlevel% neq 0 pause

@echo off
chcp 65001 >nul
set ELECTRON_RUN_AS_NODE=
set NODE_OPTIONS=
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-companion-capture.ps1"
if errorlevel 1 pause

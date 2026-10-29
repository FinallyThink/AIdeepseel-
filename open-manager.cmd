@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 exit /b 1
)
node scripts\launch.cjs --show-manager

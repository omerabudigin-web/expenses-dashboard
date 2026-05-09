@echo off
chcp 65001 >nul
title Expenses Dashboard
cd /d "%~dp0"

echo [expenses-dashboard] Checking dependencies...
if not exist "node_modules\" (
  echo [expenses-dashboard] Installing npm packages...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed. Is Node.js installed?
    pause
    exit /b 1
  )
)

echo [expenses-dashboard] Starting server on port 3001...
start "Expenses Dashboard Server" /min cmd /c "node server\index.js & pause"

echo [expenses-dashboard] Waiting for server...
timeout /t 4 /nobreak >nul

echo [expenses-dashboard] Opening browser...
start http://localhost:3001

echo.
echo  Dashboard running at http://localhost:3001
echo  Close the minimized "Expenses Dashboard Server" window to stop.
echo.

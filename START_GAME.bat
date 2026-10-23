@echo off
title Last Ward - dev server
cd /d "%~dp0game"

if not exist node_modules (
  echo First run - installing dependencies...
  call npm install
)

echo.
echo Starting Last Ward... the game will open in your browser.
echo Leave this window open while you play/edit - every file save
echo reloads the game instantly. Press Ctrl+C here to stop.
echo.
call npm run dev
pause

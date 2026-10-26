@echo off
title Stop GoodbyeDPI
cd /d "%~dp0"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [goodbyedpi] Requesting Administrator privileges (UAC)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ====================================================
echo Stopping GoodbyeDPI and unloading WinDivert...
echo ====================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-dpi.ps1"
echo.
pause


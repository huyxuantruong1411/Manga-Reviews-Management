@echo off
title GoodbyeDPI Launcher
cd /d "%~dp0"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [goodbyedpi] Requesting Administrator privileges (UAC)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ====================================================
echo Starting GoodbyeDPI for Manga-Reviews-Management...
echo ====================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dpi.ps1"
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status-dpi.ps1"
echo.
echo [goodbyedpi] Ban co the dong cua so nay. GoodbyeDPI dang chay ngam.
echo (De dung GoodbyeDPI, chay tools\goodbyedpi\stop-dpi.cmd)
echo.
pause


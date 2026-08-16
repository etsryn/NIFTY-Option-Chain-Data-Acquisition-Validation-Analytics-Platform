@echo off
title NIFTY 50 - STOP BACKEND
setlocal EnableExtensions

echo.
echo ==========================================
echo   NIFTY 50 LIVE SYSTEM - SHUTDOWN
echo ==========================================
echo.

REM ============================================================
REM PROJECT DIRECTORY
REM ============================================================
REM
REM %~dp0 = folder containing terminate.bat
REM
REM Everything is resolved relative to the project folder.
REM ============================================================

set "PROJECT_DIR=%~dp0"

echo Project:
echo %PROJECT_DIR%
echo.


REM ============================================================
REM [1/1] STOP NIFTY BACKEND ONLY
REM ============================================================

echo [1/1] Stopping NIFTY backend...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$project=[System.IO.Path]::GetFullPath($env:PROJECT_DIR); $processes=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -match 'server\.py' -and $_.CommandLine -match [regex]::Escape($project) }; if($processes){ foreach($p in $processes){ Write-Host ('Killing backend PID ' + $p.ProcessId); Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } } else { Write-Host 'No NIFTY backend process found.' }"

echo.


REM ============================================================
REM VERIFY BACKEND PORT
REM ============================================================

echo Checking port 5000...

set "BACKEND_PORT_FOUND="

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
    set "BACKEND_PORT_FOUND=1"
    echo WARNING: Port 5000 is still occupied by PID %%P
)

if defined BACKEND_PORT_FOUND (
    echo WARNING: Backend may still be running.
) else (
    echo Port 5000 is free.
)

echo.


REM ============================================================
REM STREAMLIT IS INTENTIONALLY LEFT RUNNING
REM ============================================================

echo Streamlit:
echo   KEEPING STREAMLIT SERVER RUNNING
echo   Port 8501 is intentionally untouched.

echo.


REM ============================================================
REM FINAL STATUS
REM ============================================================

echo ==========================================
echo   BACKEND SHUTDOWN COMPLETE
echo ==========================================
echo.
echo Excel       : LEFT OPEN
echo Streamlit   : LEFT RUNNING
echo Normal NSE  : LEFT OPEN
echo Feed NSE    : FEED STOPS VIA HEARTBEAT
echo Backend     : STOPPED
echo.

pause
@echo off
REM Simple server starter for Windows

cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║   HHC Social Media Image Generator                    ║
echo ║   Starting server...                                  ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Try Python first
where python3 >/dev/null 2>/dev/null
if %ERRORLEVEL% EQU 0 (
    echo ✓ Using Python 3
    python3 server.py
    exit /b 0
)

where python >/dev/null 2>/dev/null
if %ERRORLEVEL% EQU 0 (
    echo ✓ Using Python
    python server.py
    exit /b 0
)

REM Try Node.js
where npx >/dev/null 2>/dev/null
if %ERRORLEVEL% EQU 0 (
    echo ✓ Using Node.js http-server
    npx http-server dist -p 8000 -c-1
    exit /b 0
)

echo ❌ Error: No Python or Node.js found
echo.
echo Please install one of:
echo   • Python: https://www.python.org
echo   • Node.js: https://nodejs.org
echo.
pause
exit /b 1

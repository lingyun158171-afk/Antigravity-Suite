@echo off
setlocal
chcp 65001 >nul 2>nul
set "SUITE_DIR=%~dp0"
set "PY_SCRIPT=%SUITE_DIR%agy_suite.py"

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python 3.10+ not found in PATH.
    echo         Download: https://www.python.org/downloads/
    echo         Please check "Add Python to PATH" during install.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js 18+ not found in PATH.
    echo         Download: https://nodejs.org/
    pause
    exit /b 1
)

python -X utf8 "%PY_SCRIPT%" menu
exit /b %errorlevel%

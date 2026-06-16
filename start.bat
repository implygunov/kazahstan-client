@echo off
title CRY DLC SERVER
chcp 65001 >nul

cd /d "%~dp0"

echo ========================================
echo   CRY DLC - LOCAL SERVER
echo ========================================
echo.

cd backend

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Error installing dependencies!
        pause
        exit /b 1
    )
)

echo [2/3] Initializing database...
node setup-db.js

echo [3/3] Starting server...
echo.
echo Server: http://localhost:5000
echo Login:  admin / admin123
echo.
node server.js

pause

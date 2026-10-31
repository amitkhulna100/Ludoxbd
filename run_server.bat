@echo off
title Ludo X BD - Authoritative Game Server
echo ================================================================
echo   Ludo X BD - Authoritative Game Server + Cloudflare Tunnel
echo ================================================================
echo.
echo Starting Authoritative Node.js Server on port 3000...
start "Ludo X BD Server" tools\node\node.exe backend\server.js
timeout /t 2 /nobreak >nul
echo.
echo ================================================================
echo   Creating Instant Global Tunnel (Works on All Mobile Networks!)
echo ================================================================
tools\cloudflared.exe tunnel --url http://127.0.0.1:3000
pause

@echo off
REM Lancement local de KaPya ERP (Windows). Nécessite Node.js (https://nodejs.org).
cd /d "%~dp0"
node scripts\lancer.mjs %*
pause

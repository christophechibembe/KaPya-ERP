@echo off
cd /d "%~dp0"
echo KaPya ERP : ouverture sur http://localhost:8104 ^(Ctrl+C pour arreter^)
start "" "http://localhost:8104"
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8104
) else (
  python -m http.server 8104
)
pause

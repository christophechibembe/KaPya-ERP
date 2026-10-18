@echo off
cd /d "%~dp0"
echo KaPya ERP v65 : ouverture sur http://localhost:8105 ^(Ctrl+C pour arreter^)
start "" "http://localhost:8105"
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8105
) else (
  python -m http.server 8105
)
pause

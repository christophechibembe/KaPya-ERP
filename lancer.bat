@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -Command "$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, 8107); try { $listener.Start(); $listener.Stop(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Le port 8107 est deja utilise. Fermez l'autre serveur KaPya ou choisissez un autre port.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python est introuvable. Installez Python, puis relancez ce fichier.
    pause
    exit /b 1
  )
  start "KaPya ERP serveur - port 8107" /min python -m http.server 8107
) else (
  start "KaPya ERP serveur - port 8107" /min py -m http.server 8107
)

powershell -NoProfile -Command "$limit = (Get-Date).AddSeconds(15); $ready = $false; do { $client = [System.Net.Sockets.TcpClient]::new(); try { $client.Connect('127.0.0.1', 8107); $ready = $true } catch { Start-Sleep -Milliseconds 250 } finally { $client.Dispose() } } while (-not $ready -and (Get-Date) -lt $limit); if (-not $ready) { exit 1 }"
if errorlevel 1 (
  echo Le serveur n'a pas demarre. Verifiez Python ou le port 8107.
  pause
  exit /b 1
)

echo KaPya ERP v68 est pret sur http://localhost:8107
start "" "http://localhost:8107"
echo Gardez la fenetre du serveur ouverte. Fermez-la pour arreter le serveur.
pause

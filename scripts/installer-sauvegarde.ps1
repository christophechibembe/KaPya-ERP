# Installe une tache planifiee Windows pour la sauvegarde hebdomadaire KaPya.
# A executer une fois, dans le dossier du depot :
#   powershell -ExecutionPolicy Bypass -File scripts\installer-sauvegarde.ps1
# Options : -Jour Dimanche -Heure 03:00 -Garder 8 -Copie "E:\sauvegardes"
# La tache utilise l'URL de connexion de %USERPROFILE%\.kapya\db-url.txt.

param(
  [string]$Jour = "Dimanche",
  [string]$Heure = "03:00",
  [int]$Garder = 8,
  [string]$Copie = ""
)

$ErrorActionPreference = "Stop"

$racine = Split-Path -Parent $PSScriptRoot
$script = Join-Path $racine "scripts\sauvegarde-production.mjs"
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$urlFichier = Join-Path $env:USERPROFILE ".kapya\db-url.txt"

if (-not $node) { throw "Node.js est introuvable dans le PATH." }
if (-not (Test-Path $script)) { throw "Script introuvable : $script" }

if (-not (Test-Path $urlFichier)) {
  Write-Warning "URL de connexion absente : $urlFichier"
  Write-Warning "Creez ce fichier avec l'URL Session pooler complete, puis relancez."
  Write-Warning "Exemple : postgresql://postgres.<reference>:<mot-de-passe>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
  exit 1
}

if ($Copie) {
  $copieFichier = Join-Path $env:USERPROFILE ".kapya\copie-sauvegarde.txt"
  Set-Content -Path $copieFichier -Value $Copie -Encoding UTF8
  Write-Host "Copie hors site configuree : $Copie"
}

$jours = @{
  "Lundi" = "Monday"; "Mardi" = "Tuesday"; "Mercredi" = "Wednesday"; "Jeudi" = "Thursday"
  "Vendredi" = "Friday"; "Samedi" = "Saturday"; "Dimanche" = "Sunday"
}
$jourEn = $jours[$Jour]
if (-not $jourEn) { throw "Jour invalide : $Jour (Lundi..Dimanche)." }

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`" --garder $Garder" -WorkingDirectory $racine
$declencheur = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $jourEn -At $Heure
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$description = "Dump officiel KaPya ERP (schema + donnees) avec rotation et copie hors site."

$tache = "KaPya - Sauvegarde hebdomadaire"
Register-ScheduledTask -TaskName $tache -Action $action -Trigger $declencheur -Settings $reglages -Description $description -Force | Out-Null

Write-Host "Tache installee : $tache"
Write-Host "Prochaine execution : $Jour a $Heure"
Write-Host "Test immediat : schtasks /Run /TN `"$tache`""
Write-Host "Journal : $((Join-Path (Split-Path -Parent $racine) 'kapya-sauvegardes\sauvegarde.log'))"

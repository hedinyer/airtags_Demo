# Uso: .\deploy\push-to-vps.ps1 -Target user@IP
param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$remote = "/opt/airtags"
$files = @(
  "airtag.py",
  "_login.py",
  "_fmip.py",
  "requirements.txt",
  "index.html",
  "account.json",
  "ani_libs.bin",
  ".env",
  "locations.json"
)

Write-Host "Creando dirs remotos..."
ssh $Target "sudo mkdir -p $remote/accesorios $remote/deploy && sudo chown -R `${USER}: $remote"

Write-Host "Subiendo codigo y secretos..."
scp @files "${Target}:$remote/"
scp -r accesorios/accesorios.json "${Target}:$remote/accesorios/"
# Si el master no basta, sube todos los JSON (puede tardar):
# scp -r accesorios "${Target}:$remote/"

scp deploy/airtags.service deploy/setup-vps.sh "${Target}:$remote/deploy/"

Write-Host "Instalando servicio..."
ssh $Target @"
sudo bash $remote/deploy/setup-vps.sh
sudo chown -R airtags:airtags $remote
sudo systemctl restart airtags
sudo systemctl --no-pager status airtags
"@

Write-Host "OK. Logs: ssh $Target 'sudo journalctl -u airtags -f'"

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$zip = Join-Path $dist "SonicShielding-v$($manifest.version).zip"
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $zip) { Remove-Item -LiteralPath $zip }
$items = @("manifest.json", "src", "icons", "README.md", "PRIVACY.md") | ForEach-Object { Join-Path $root $_ }
Compress-Archive -Path $items -DestinationPath $zip
Write-Output $zip

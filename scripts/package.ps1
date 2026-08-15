$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$zip = Join-Path $dist "SonicShielding-v0.1.0.zip"
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $zip) { Remove-Item -LiteralPath $zip }
$items = @("manifest.json", "src", "icons", "README.md", "PRIVACY.md") | ForEach-Object { Join-Path $root $_ }
Compress-Archive -Path $items -DestinationPath $zip
Write-Output $zip

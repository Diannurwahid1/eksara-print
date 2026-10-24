param(
  [string]$ApiBaseUrl = 'https://ekasra.web.id/api'
)

$ErrorActionPreference = 'Stop'
$apiEnvironment = Join-Path $PSScriptRoot '..\api\.env'
if (-not (Test-Path -LiteralPath $apiEnvironment)) {
  throw 'apps/api/.env is required to read the local Station device token.'
}

$tokenLine = Get-Content -LiteralPath $apiEnvironment | Where-Object { $_ -match '^EKSARA_STATION_DEVICE_TOKEN=' } | Select-Object -First 1
$token = if ($tokenLine) { $tokenLine.Substring('EKSARA_STATION_DEVICE_TOKEN='.Length) } else { '' }
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'Set EKSARA_STATION_DEVICE_TOKEN in apps/api/.env before starting Station.'
}
if ($ApiBaseUrl -notmatch '^https://[^/]+(?:/.*)?$' -and $ApiBaseUrl -notmatch '^http://(?:127\.0\.0\.1|localhost):\d+(?:/.*)?$') {
  throw 'Station API URL must use HTTPS, except for localhost development.'
}

$env:EKSARA_API_BASE_URL = $ApiBaseUrl.TrimEnd('/')
$env:EKSARA_STATION_DEVICE_TOKEN = $token
try {
  Push-Location (Join-Path $PSScriptRoot '..\..')
  try { pnpm --filter @eksara/station start } finally { Pop-Location }
} finally {
  Remove-Item Env:EKSARA_API_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:EKSARA_STATION_DEVICE_TOKEN -ErrorAction SilentlyContinue
}

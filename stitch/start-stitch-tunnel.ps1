$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TunnelClient = Join-Path $Root 'tunnel-client\tunnel-client.exe'
$Profile = Join-Path $Root 'config\stitch-tunnel.yaml'
$StitchKeyFile = Join-Path $Root 'secrets\stitch-api-key.txt'
$RuntimeKeyFile = Join-Path $Root 'secrets\runtime-api-key.txt'

if (-not (Test-Path $TunnelClient)) {
    throw "Missing tunnel-client.exe: $TunnelClient"
}
if (-not (Test-Path $Profile)) {
    throw "Missing profile: $Profile"
}
if (-not (Test-Path $StitchKeyFile)) {
    throw 'Missing secrets\stitch-api-key.txt. Copy secrets\stitch-api-key.example first.'
}
if (-not (Test-Path $RuntimeKeyFile)) {
    throw 'Missing secrets\runtime-api-key.txt. Copy secrets\runtime-api-key.example first.'
}

$profileText = Get-Content $Profile -Raw
if ($profileText -match '__TUNNEL_ID__') {
    throw 'Open config\stitch-tunnel.yaml and replace __TUNNEL_ID__ first.'
}

$stitchKey = (Get-Content $StitchKeyFile -Raw).Trim()
$runtimeKey = (Get-Content $RuntimeKeyFile -Raw).Trim()

if (-not $stitchKey -or $stitchKey.StartsWith('PASTE_')) {
    throw 'Paste your Stitch API key into secrets\stitch-api-key.txt first.'
}
if (-not $runtimeKey -or $runtimeKey.StartsWith('PASTE_')) {
    throw 'Paste your OpenAI Runtime API key into secrets\runtime-api-key.txt first.'
}

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    Write-Host 'Installing Stitch Tunnel dependencies...'
    Push-Location $Root
    try { npm install }
    finally { Pop-Location }
}

$env:CONTROL_PLANE_API_KEY = $runtimeKey

Write-Host 'Starting Workshop Stitch Tunnel...'
Write-Host "Workspace: $(Resolve-Path (Join-Path $Root '..\workspace'))"

Push-Location $Root
try {
    & $TunnelClient run --profile-file $Profile
}
finally {
    Pop-Location
}

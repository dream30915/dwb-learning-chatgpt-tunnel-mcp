$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Profile = Join-Path $Root 'config\serena-tunnel.yaml'
$RuntimeKey = Join-Path $Root 'secrets\runtime-api-key.txt'
$Workspace = Join-Path (Split-Path -Parent $Root) 'workspace'
$LocalTunnelClient = Join-Path $Root 'tunnel-client\tunnel-client.exe'
$LocalSerena = Join-Path $Root 'serena-runtime\bin\serena.exe'

if (-not (Test-Path $Profile)) { throw "Missing profile: $Profile" }
if (-not (Test-Path $RuntimeKey)) { throw "Missing runtime key file: $RuntimeKey" }
if (-not (Test-Path $Workspace)) { throw "Missing workspace: $Workspace" }

$profileText = Get-Content $Profile -Raw
if ($profileText -match '__TUNNEL_ID__') {
    throw 'Replace __TUNNEL_ID__ in config\serena-tunnel.yaml first.'
}

$key = (Get-Content $RuntimeKey -Raw).Trim()
if (-not $key -or $key -eq 'PASTE_OPENAI_RUNTIME_API_KEY_HERE') {
    throw 'Paste your OpenAI Runtime API Key into secrets\runtime-api-key.txt first.'
}
$env:CONTROL_PLANE_API_KEY = $key

if (Test-Path $LocalSerena) {
    $env:PATH = "$(Split-Path $LocalSerena -Parent);$env:PATH"
} elseif (-not (Get-Command serena -ErrorAction SilentlyContinue)) {
    throw 'Serena was not found. Install Serena or place it in serena-runtime\bin.'
}

if (Test-Path $LocalTunnelClient) {
    $TunnelClient = $LocalTunnelClient
} else {
    $TunnelCommand = Get-Command tunnel-client -ErrorAction SilentlyContinue
    if (-not $TunnelCommand) {
        throw 'tunnel-client was not found. Put tunnel-client.exe in serena\tunnel-client or add it to PATH.'
    }
    $TunnelClient = $TunnelCommand.Source
}

Set-Location $Root

Write-Host ''
Write-Host '=================================='
Write-Host ' ChatGPT + Serena Tunnel Workshop'
Write-Host '=================================='
Write-Host "Workspace : $Workspace"
Write-Host "Profile   : $Profile"
Write-Host ''
Write-Host 'Keep this window open while using ChatGPT.' -ForegroundColor Cyan
Write-Host ''

& $TunnelClient run --profile-file $Profile

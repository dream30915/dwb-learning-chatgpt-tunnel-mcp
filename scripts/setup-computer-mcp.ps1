$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Repo root: $repoRoot"
if (-not (Test-Path (Join-Path $repoRoot "computer-mcp\package.json"))) {
  throw "computer-mcp/package.json not found. Run this script from the workshop repo."
}

$computerMcpDir = Join-Path $repoRoot "computer-mcp"
Write-Host "Installing computer-mcp dependencies..."
Push-Location $computerMcpDir
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed in computer-mcp" }
} finally {
  Pop-Location
}

$tunnelDir = Join-Path $repoRoot "tunnel-client"
New-Item -ItemType Directory -Force -Path $tunnelDir | Out-Null

$exePath = Join-Path $tunnelDir "tunnel-client.exe"
if (Test-Path $exePath) {
  Write-Host "Keeping existing tunnel-client.exe"
} else {
  Write-Warning "tunnel-client.exe is not installed by this script."
  Write-Host "Download it from the OpenAI page for your account, then place it at: $exePath"
}

$keyFile = Join-Path $tunnelDir "runtime-api-key.txt"
if (-not (Test-Path $keyFile)) {
  @(
    "# Paste your OpenAI Runtime API Key on the next line."
    "# Then delete these comment lines. Keep only the key."
  ) | Set-Content -Path $keyFile -Encoding utf8
  Write-Host "Created empty key file: $keyFile"
} else {
  Write-Host "Keeping existing key file: $keyFile"
  $sanitize = Join-Path $PSScriptRoot "sanitize-runtime-api-key.ps1"
  if (Test-Path $sanitize) {
    Write-Host "Sanitizing runtime API key file (no key output)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File $sanitize
  }
}

$profilePath = Join-Path $tunnelDir "chatgpt-mcp-workshop.yaml"
$tunnelId = "<YOUR_TUNNEL_ID>"
if (Test-Path $profilePath) {
  $existing = Get-Content -Path $profilePath -Raw -ErrorAction SilentlyContinue
  if ($existing -match 'tunnel_id:\s*"([^"]+)"') {
    $found = $Matches[1]
    if ($found -and $found -ne "<YOUR_TUNNEL_ID>") {
      $tunnelId = $found
      Write-Host "Keeping existing Tunnel ID from profile."
    }
  }
}

$repoRootUnix = $repoRoot.Replace("\", "/")
$keyFileUnix = $keyFile.Replace("\", "/")
$mcpCommand = "node `"$repoRootUnix/computer-mcp/server.mjs`""

$yaml = @"
config_version: 1

control_plane:
  base_url: "https://api.openai.com"
  # Replace with your own Tunnel ID.
  tunnel_id: "$tunnelId"
  # Keep the actual key outside Git and point to its local file.
  api_key: "file:$keyFileUnix"

health:
  listen_addr: "127.0.0.1:18020"

admin_ui:
  open_browser: false

log:
  level: info
  format: json

mcp:
  commands:
    - channel: main
      # Computer MCP is the default: files + allowlisted read-only commands.
      # Freeform PowerShell is off unless COMPUTER_MCP_ALLOW_UNRESTRICTED_SHELL=1
      # is set on the process that starts tunnel-client. This script does not set that env.
      command: '$mcpCommand'

      # File System MCP example: replace the command above with this line.
      # command: 'npx -y @modelcontextprotocol/server-filesystem "$repoRootUnix/mcp-demo-files"'

      # Google Stitch example: replace the command above with this line.
      # command: 'node "$repoRootUnix/stitch-async-mcp/artifact-server.mjs"'
"@

Set-Content -Path $profilePath -Value $yaml.TrimEnd() -Encoding utf8
Write-Host "Wrote local profile: $profilePath"

Write-Host ""
Write-Host "Computer MCP is ready (files + allowlisted commands; freeform PowerShell is off)."
Write-Host "You still need to create the Tunnel yourself:"
Write-Host "1. Create a Tunnel in OpenAI / ChatGPT Developer Mode and copy the Tunnel ID."
Write-Host "2. Put the Runtime API Key into: $keyFile"
Write-Host "3. Put the Tunnel ID into: $profilePath"
Write-Host "4. Run:"
Write-Host "   cd `"$tunnelDir`""
Write-Host "   .\tunnel-client.exe doctor --profile-file .\chatgpt-mcp-workshop.yaml"
Write-Host "   .\tunnel-client.exe run --profile-file .\chatgpt-mcp-workshop.yaml"

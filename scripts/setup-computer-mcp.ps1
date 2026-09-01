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
  Write-Host "Downloading OpenAI tunnel-client for Windows..."
  $headers = @{
    "User-Agent" = "woravej-chatgpt-mcp-workshop"
    "Accept" = "application/vnd.github+json"
  }
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/openai/tunnel-client/releases/latest" -Headers $headers
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "amd64" }
  $asset = $release.assets |
    Where-Object { $_.name -like "tunnel-client-v*-windows-$arch.zip" -and $_.name -notlike "*cloudflared*" } |
    Select-Object -First 1
  if (-not $asset) {
    throw "Could not find Windows $arch tunnel-client zip in the latest OpenAI release."
  }

  $zip = Join-Path $env:TEMP "tunnel-client-windows-$arch.zip"
  $extract = Join-Path $env:TEMP "tunnel-client-extract-$arch"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $extract | Out-Null
  curl.exe -L --fail --retry 3 --retry-delay 2 -o $zip $asset.browser_download_url
  if ($LASTEXITCODE -ne 0) { throw "Failed to download tunnel-client zip" }
  Expand-Archive -Path $zip -DestinationPath $extract -Force

  $downloadedExe = Get-ChildItem $extract -Recurse -Filter "tunnel-client.exe" | Select-Object -First 1
  if (-not $downloadedExe) { throw "tunnel-client.exe was not inside the downloaded zip" }
  Copy-Item $downloadedExe.FullName $exePath -Force

  $cloudflared = Get-ChildItem $extract -Recurse -Filter "cloudflared.exe" | Select-Object -First 1
  if ($cloudflared) {
    Copy-Item $cloudflared.FullName (Join-Path $tunnelDir "cloudflared.exe") -Force
  }
  Write-Host "Installed tunnel-client.exe from $($release.tag_name)"
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
      # Computer MCP is the default: files + PowerShell in computer-workspace.
      command: '$mcpCommand'

      # File System MCP example: replace the command above with this line.
      # command: 'npx -y @modelcontextprotocol/server-filesystem "$repoRootUnix/mcp-demo-files"'

      # Google Stitch example: replace the command above with this line.
      # command: 'node "$repoRootUnix/stitch-async-mcp/artifact-server.mjs"'
"@

Set-Content -Path $profilePath -Value $yaml.TrimEnd() -Encoding utf8
Write-Host "Wrote local profile: $profilePath"

Write-Host ""
Write-Host "Computer MCP is ready. You still need to create the Tunnel yourself:"
Write-Host "1. Create a Tunnel in OpenAI / ChatGPT Developer Mode and copy the Tunnel ID."
Write-Host "2. Put the Runtime API Key into: $keyFile"
Write-Host "3. Put the Tunnel ID into: $profilePath"
Write-Host "4. Run:"
Write-Host "   cd `"$tunnelDir`""
Write-Host "   .\tunnel-client.exe doctor --profile-file .\chatgpt-mcp-workshop.yaml"
Write-Host "   .\tunnel-client.exe run --profile-file .\chatgpt-mcp-workshop.yaml"

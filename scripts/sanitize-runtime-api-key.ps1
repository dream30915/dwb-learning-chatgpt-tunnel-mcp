$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$keyFile = Join-Path $repoRoot "tunnel-client\runtime-api-key.txt"
if (-not (Test-Path $keyFile)) {
  Write-Host "status=missing"
  Write-Host "key file not found: $keyFile"
  exit 2
}

$bytes = [System.IO.File]::ReadAllBytes($keyFile)
$offset = 0
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  $offset = 3
}
$text = [System.Text.Encoding]::UTF8.GetString($bytes, $offset, $bytes.Length - $offset)
$text = $text.Trim()
if (
  ($text.StartsWith('"') -and $text.EndsWith('"') -and $text.Length -ge 2) -or
  ($text.StartsWith("'") -and $text.EndsWith("'") -and $text.Length -ge 2)
) {
  $text = $text.Substring(1, $text.Length - 2).Trim()
}

if ([string]::IsNullOrWhiteSpace($text)) {
  Write-Host "status=empty length=0"
  exit 1
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllBytes($keyFile, $utf8NoBom.GetBytes($text))

if ($text -notmatch '^[0-9A-Za-z_-]+$') {
  Write-Host ("status=has_disallowed_char length=" + $text.Length)
  exit 1
}

Write-Host ("status=ok length=" + $text.Length)
exit 0

# IF-19: listening TCP sockets of running target processes. Reads only; never connects.
# ASCII only (IF-21). Input: i.json {target}. Output: o.json.
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  $tmp = "$outPath.tmp"
  [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force $tmp $outPath
}
try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $target = [string]$p.target
  $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $target) } | ForEach-Object { $_.Id })
  $ports = New-Object System.Collections.ArrayList
  if ($procIds.Count -gt 0) {
    $conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $procIds -contains $_.OwningProcess }
    foreach ($c in $conns) { [void]$ports.Add(@{ pid = [int]$c.OwningProcess; address = [string]$c.LocalAddress; port = [int]$c.LocalPort }) }
  }
  Save @{ running = ($procIds.Count -gt 0); pids = @($procIds); ports = @($ports.ToArray()) }
} catch {
  Save @{ error = $_.Exception.Message }
}

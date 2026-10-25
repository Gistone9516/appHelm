# 실행 계층: 실행 중인 대상 창에 WM_COMMAND를 보내거나 키 입력을 보낸다.
# ASCII only (IF-21). Input i.json: { target, mode: "wm_command"|"keys", commandId?, keys?, title? }
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  [IO.File]::WriteAllText("$outPath.tmp", $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force "$outPath.tmp" $outPath
}
try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetForegroundWindow(IntPtr h);
  public const uint WM_COMMAND = 0x0111;
}
"@
  $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq [string]$p.target) } | ForEach-Object { $_.Id })
  $wins = @()
  foreach ($procId in $procIds) {
    $pr = Get-Process -Id $procId
    if ($pr.MainWindowHandle -ne 0) { $wins += $pr.MainWindowHandle }
  }
  if ($wins.Count -eq 0) { Save @{ error = "대상의 최상위 창을 찾지 못했습니다. 대상이 실행 중이고 창이 있어야 합니다." }; exit }
  $h = $wins[0]
  if ($p.mode -eq "wm_command") {
    [void][Win]::SendMessage($h, [Win]::WM_COMMAND, [IntPtr][int]$p.commandId, [IntPtr]::Zero)
    Save @{ ok = $true; mode = "wm_command"; commandId = [int]$p.commandId; window = ("0x{0:x}" -f [int64]$h) }
  } elseif ($p.mode -eq "keys") {
    [void][Win]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 150
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait([string]$p.keys)
    Save @{ ok = $true; mode = "keys"; keys = [string]$p.keys }
  } else {
    Save @{ error = "알 수 없는 mode: $($p.mode)" }
  }
} catch {
  Save @{ error = $_.Exception.Message }
}

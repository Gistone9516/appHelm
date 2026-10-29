# Operate layer: send WM_COMMAND or keystrokes to the running target's window.
# ASCII only (IF-21). Input i.json: { target, mode: "wm_command"|"keys"|"show", commandId?, keys?, state? }
# keys: refuses unless the target window really became foreground, so keystrokes never land in another app (F-35).
# show: state restore|minimize|maximize. A window cloaked by the shell (another virtual desktop) cannot be brought here.
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
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public static int Cloaked(IntPtr h) { int v = 0; DwmGetWindowAttribute(h, 14, out v, 4); return v; }
  public const uint WM_COMMAND = 0x0111;
}
"@
  $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq [string]$p.target) } | ForEach-Object { $_.Id })
  $wins = @()
  foreach ($procId in $procIds) {
    $pr = Get-Process -Id $procId
    if ($pr.MainWindowHandle -ne 0) { $wins += $pr.MainWindowHandle }
  }
  if ($wins.Count -eq 0) { Save @{ error = "no top-level window of the target. It must be running with a window." }; exit }
  $h = $wins[0]
  $cloaked = [Win]::Cloaked($h)
  if ($cloaked -ne 0 -and $p.mode -ne "wm_command") { Save @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-window"; message = "target window is cloaked (another virtual desktop, cloaked=$cloaked). Switch to that desktop or move the window first." } }; exit }
  if ($p.mode -eq "wm_command") {
    [void][Win]::SendMessage($h, [Win]::WM_COMMAND, [IntPtr][int]$p.commandId, [IntPtr]::Zero)
    Save @{ ok = $true; mode = "wm_command"; commandId = [int]$p.commandId; window = ("0x{0:x}" -f [int64]$h) }
  } elseif ($p.mode -eq "keys") {
    if ([Win]::IsIconic($h)) { [void][Win]::ShowWindowAsync($h, 9); Start-Sleep -Milliseconds 300 }
    [void][Win]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 150
    if ([Win]::GetForegroundWindow() -ne $h) { Save @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-window"; message = "target window did not become foreground; keys were not sent" } }; exit }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait([string]$p.keys)
    Save @{ ok = $true; mode = "keys"; keys = [string]$p.keys }
  } elseif ($p.mode -eq "show") {
    $codes = @{ restore = 9; minimize = 6; maximize = 3 }
    $state = [string]$p.state
    if (-not $codes.ContainsKey($state)) { Save @{ error = "unknown state: $state" }; exit }
    [void][Win]::ShowWindowAsync($h, $codes[$state])
    if ($state -ne "minimize") { Start-Sleep -Milliseconds 200; [void][Win]::SetForegroundWindow($h) }
    Save @{ ok = $true; mode = "show"; state = $state; window = ("0x{0:x}" -f [int64]$h) }
  } else {
    Save @{ error = "unknown mode: $($p.mode)" }
  }
} catch {
  Save @{ error = $_.Exception.Message }
}

# Operate layer (IF-34): click a screen coordinate. ASCII only (IF-21).
# Input i.json: { x, y, target?, button?("left"|"right"), double? }
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  [IO.File]::WriteAllText("$outPath.tmp", $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force "$outPath.tmp" $outPath
}
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class ClickNative {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  public static IntPtr MainWindowOf(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
"@
try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $x = [int]$p.x; $y = [int]$p.y
  $button = if ($p.PSObject.Properties.Name -contains "button") { [string]$p.button } else { "left" }
  if ($p.PSObject.Properties.Name -contains "target" -and $p.target) {
    $t = [string]$p.target
    $procs = @()
    if ($t -match '[\\/]') { $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $t) }) }
    else { $base = $t -replace '\.exe$', ''; $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -ieq $base }) }
    $h = $null
    foreach ($pr in $procs) { $hh = [ClickNative]::MainWindowOf([uint32]$pr.Id); if ($hh -ne [IntPtr]::Zero) { $h = $hh; break } }
    if ($h) { [void][ClickNative]::SetForegroundWindow($h); Start-Sleep -Milliseconds 300 }
  }
  [ClickNative]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 120
  # down/up flags: left 0x0002/0x0004, right 0x0008/0x0010
  $down = if ($button -eq "right") { 0x0008 } else { 0x0002 }
  $up = if ($button -eq "right") { 0x0010 } else { 0x0004 }
  $times = if ($p.PSObject.Properties.Name -contains "double" -and $p.double) { 2 } else { 1 }
  for ($i = 0; $i -lt $times; $i++) {
    [ClickNative]::mouse_event($down, 0, 0, 0, [IntPtr]::Zero)
    [ClickNative]::mouse_event($up, 0, 0, 0, [IntPtr]::Zero)
    if ($times -gt 1) { Start-Sleep -Milliseconds 80 }
  }
  Save @{ ok = $true; x = $x; y = $y; button = $button }
} catch {
  Save @{ error = $_.Exception.Message }
}

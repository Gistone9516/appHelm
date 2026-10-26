# Operate layer (IF-34): screenshot a window or region to PNG. ASCII only (IF-21).
# Input i.json: { out, target?, region?{x,y,w,h}, base64? }
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  [IO.File]::WriteAllText("$outPath.tmp", $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force "$outPath.tmp" $outPath
}
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class ShotNative {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  // PowerShell passes $null to a C# string parameter as "", so an empty title means no title filter
  public static IntPtr Find(uint pid, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (!IsWindowVisible(h)) return true;
      if (pid != 0 && p != pid) return true;
      if (!String.IsNullOrEmpty(title)) { var s = new StringBuilder(256); GetWindowText(h, s, 256); if (s.ToString() != title) return true; }
      RECT r; GetWindowRect(h, out r); if ((r.R - r.L) < 100 || (r.B - r.T) < 100) return true;
      found = h; return false;
    }, IntPtr.Zero);
    return found;
  }
  public static RECT Rect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }
}
"@
try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $out = [string]$p.out
  $x = 0; $y = 0; $w = 0; $h = 0
  if ($p.PSObject.Properties.Name -contains "region" -and $p.region) {
    $x = [int]$p.region.x; $y = [int]$p.region.y; $w = [int]$p.region.w; $h = [int]$p.region.h
  } elseif ($p.PSObject.Properties.Name -contains "target" -and $p.target) {
    $t = [string]$p.target
    $hwnd = [IntPtr]::Zero
    if ($t -match '[\\/]') {
      foreach ($pr in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $t) })) { $hwnd = [ShotNative]::Find([uint32]$pr.Id, $null); if ($hwnd -ne [IntPtr]::Zero) { break } }
    } elseif ($t -match '\.exe$' -or -not ($t -match '\s')) {
      $base = $t -replace '\.exe$', ''
      foreach ($pr in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -ieq $base })) { $hwnd = [ShotNative]::Find([uint32]$pr.Id, $null); if ($hwnd -ne [IntPtr]::Zero) { break } }
    }
    if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [ShotNative]::Find(0, $t) }  # treat target as a window title
    if ($hwnd -eq [IntPtr]::Zero) { throw "window not found: $t" }
    $r = [ShotNative]::Rect($hwnd); $x = $r.L; $y = $r.T; $w = $r.R - $r.L; $h = $r.B - $r.T
  } else {
    $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen 2>$null
    if (-not $vs) { Add-Type -AssemblyName System.Windows.Forms; $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen }
    $x = $vs.X; $y = $vs.Y; $w = $vs.Width; $h = $vs.Height
  }
  if ($w -le 0 -or $h -le 0) { throw "invalid region size: ${w}x${h}" }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  $res = @{ ok = $true; path = $out; w = $w; h = $h }
  if ($p.PSObject.Properties.Name -contains "base64" -and $p.base64) {
    $bytes = [IO.File]::ReadAllBytes($out)
    $res.base64 = [Convert]::ToBase64String($bytes)
    $res.bytes = $bytes.Length
  }
  Save $res
} catch {
  Save @{ error = $_.Exception.Message }
}

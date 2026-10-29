# Operate layer (IF-34): focus, clear, type Unicode text, optionally send. ASCII only (IF-21).
# Input i.json: { text, x?, y?, target?, clear?(default true), enter? }
# Unicode SendInput keeps Korean safe; clear defaults to true so text never appends to old content.
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 6 -Compress
  [IO.File]::WriteAllText("$outPath.tmp", $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force "$outPath.tmp" $outPath
}
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class Typer {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] p, int cb);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  const uint KEY = 1; const uint KEYUP = 0x0002; const uint UNICODE = 0x0004;
  static INPUT Key(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = KEY; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
  static void Send(INPUT[] a) { SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }
  public static void TypeText(string s) {
    foreach (char c in s) {
      // newline becomes Enter (Shift+Enter would be a soft break; plain text here)
      Send(new INPUT[] { Key(0, c, UNICODE), Key(0, c, UNICODE | KEYUP) });
    }
  }
  public static void Vk(ushort vk, bool ctrl) {
    var list = new System.Collections.Generic.List<INPUT>();
    if (ctrl) list.Add(Key(0x11, 0, 0));
    list.Add(Key(vk, 0, 0)); list.Add(Key(vk, 0, KEYUP));
    if (ctrl) list.Add(Key(0x11, 0, KEYUP));
    Send(list.ToArray());
  }
  public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(120); mouse_event(0x0002,0,0,0,IntPtr.Zero); mouse_event(0x0004,0,0,0,IntPtr.Zero); }
}
"@
try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $text = [string]$p.text
  $clear = -not ($p.PSObject.Properties.Name -contains "clear" -and -not $p.clear)
  if (($p.PSObject.Properties.Name -contains "x") -and ($p.PSObject.Properties.Name -contains "y")) {
    [Typer]::Click([int]$p.x, [int]$p.y); Start-Sleep -Milliseconds 200
  }
  if ($clear) { [Typer]::Vk(0x41, $true); Start-Sleep -Milliseconds 60; [Typer]::Vk(0x2E, $false); Start-Sleep -Milliseconds 60 } # Ctrl+A, Delete
  [Typer]::TypeText($text)
  Start-Sleep -Milliseconds 150
  if ($p.PSObject.Properties.Name -contains "enter" -and $p.enter) { [Typer]::Vk(0x0D, $false) } # Enter
  Save @{ ok = $true; typed = $text.Length; cleared = $clear; sent = [bool]($p.enter) }
} catch {
  Save @{ error = $_.Exception.Message }
}

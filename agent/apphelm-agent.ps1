# AppHelm - 설치가 필요 없는 원격 에이전트 (Windows 기본 PowerShell/.NET만 사용)
# 노트북 등 원격 노드에서 "직접" 실행하세요. 그 세션에서 COM·창 조작을 합니다.
#   사용법:  powershell -ExecutionPolicy Bypass -File apphelm-agent.ps1 -Token <토큰> [-Port 47817]
# 조작하는 쪽(.53)에서:  $env:APPHELM_TOKEN="<토큰>"; apphelm invoke-com ... --host <이 노드>
param([string]$Token, [int]$Port = 47817)
$ErrorActionPreference = "Stop"
$AgentVersion = "2026-10-30.9-fg"  # 조작하는 쪽이 /health로 버전을 확인한다
if (-not $Token) { Write-Error "토큰이 필요합니다: -Token <값>"; exit 1 }

# COM은 에이전트 메인 스레드(STA)에서 직접 실행한다. 자식 런스페이스에서는 COM 지연바인딩이
# 값을 돌려주지 못하는 문제가 있었다(측정 2026-10-25, F-17). 메인 스레드라 멈춤 위험은 있으나,
# 보호된 보기 등은 UIA로 먼저 풀어 COM 블록을 피한다.
# >>> com-core (generated from src/ps/com-core.ps1 by scripts/build-ps.ts; do not edit here)
# AppHelm COM core (IF-26..IF-28). ASCII only (IF-21).
# Source of truth (IF-29): scripts/build-ps.ts copies this file between the com-core markers
# of agent/apphelm-agent.ps1 and src/ps/scripts/invoke-com.ps1. Edit here, then run: npm run build:ps
Add-Type -AssemblyName Microsoft.VisualBasic

function ComCore-ErrText($e) {
  $x = $e
  if ($x -is [System.Management.Automation.ErrorRecord]) { $x = $x.Exception }
  while ($x.InnerException) { $x = $x.InnerException }
  return [string]$x.Message
}

# "3, 'a,b', true" -> @(3, 'a,b', $true)
function ComCore-ParseArgs([string]$s) {
  $out = New-Object System.Collections.ArrayList
  if ($s.Trim().Length -eq 0) { return ,@() }
  $parts = New-Object System.Collections.ArrayList
  $cur = New-Object System.Text.StringBuilder
  $q = [char]0
  foreach ($ch in $s.ToCharArray()) {
    if ($q -ne [char]0) {
      [void]$cur.Append($ch)
      if ($ch -eq $q) { $q = [char]0 }
    } elseif ($ch -eq '"' -or $ch -eq "'") {
      $q = $ch; [void]$cur.Append($ch)
    } elseif ($ch -eq ',') {
      [void]$parts.Add($cur.ToString()); [void]$cur.Clear()
    } else { [void]$cur.Append($ch) }
  }
  [void]$parts.Add($cur.ToString())
  foreach ($raw in $parts) {
    $t = $raw.Trim()
    if ($t -match '^-?[0-9]+$') { [void]$out.Add([int]$t) }
    elseif ($t -match '^-?[0-9]+[.][0-9]+$') { [void]$out.Add([double]$t) }
    elseif ($t.Length -ge 2 -and (($t[0] -eq '"' -and $t[-1] -eq '"') -or ($t[0] -eq "'" -and $t[-1] -eq "'"))) { [void]$out.Add($t.Substring(1, $t.Length - 2)) }
    elseif ($t -ieq 'true') { [void]$out.Add($true) }
    elseif ($t -ieq 'false') { [void]$out.Add($false) }
    elseif ($t -ieq 'missing') { [void]$out.Add([Type]::Missing) }
    else { [void]$out.Add($t) }
  }
  return ,$out.ToArray()
}

# "Paragraphs(3).Range.Style" -> segments @{name; args}
function ComCore-SplitPath([string]$p) {
  $segs = New-Object System.Collections.ArrayList
  $cur = New-Object System.Text.StringBuilder
  $depth = 0; $q = [char]0
  foreach ($ch in $p.ToCharArray()) {
    if ($q -ne [char]0) { [void]$cur.Append($ch); if ($ch -eq $q) { $q = [char]0 }; continue }
    if ($ch -eq '"' -or $ch -eq "'") { $q = $ch; [void]$cur.Append($ch); continue }
    if ($ch -eq '(') { $depth++ }
    if ($ch -eq ')') { $depth-- }
    if ($ch -eq '.' -and $depth -eq 0) { [void]$segs.Add($cur.ToString()); [void]$cur.Clear(); continue }
    [void]$cur.Append($ch)
  }
  [void]$segs.Add($cur.ToString())
  $res = New-Object System.Collections.ArrayList
  foreach ($sg in $segs) {
    $t = $sg.Trim()
    if ($t.Length -eq 0) { throw "empty path segment in '$p'" }
    $open = $t.IndexOf('(')
    if ($open -gt 0 -and $t.EndsWith(')')) {
      [void]$res.Add(@{ name = $t.Substring(0, $open); args = (ComCore-ParseArgs $t.Substring($open + 1, $t.Length - $open - 2)); hasArgs = $true })
    } else {
      [void]$res.Add(@{ name = $t; args = @(); hasArgs = $false })
    }
  }
  return ,$res.ToArray()
}

function ComCore-NormArg($v) {
  if ($v -is [decimal]) { return [double]$v }
  if ($v -is [long] -and $v -le [int]::MaxValue -and $v -ge [int]::MinValue) { return [int]$v }
  return $v
}

# get / call a member; Name(args) falls back to Name.Item(args) (IF-26)
function ComCore-Get($obj, [string]$name, [object[]]$argv) {
  $t = $obj.GetType()
  $both = [Reflection.BindingFlags]'InvokeMethod,GetProperty'
  try {
    $r = $t.InvokeMember($name, $both, $null, $obj, $argv)
    return ,$r
  } catch {
    $first = $_
    if ($argv.Count -eq 0) { throw (ComCore-ErrText $first) }
    try {
      $coll = $t.InvokeMember($name, [Reflection.BindingFlags]::GetProperty, $null, $obj, @())
      $r = $coll.GetType().InvokeMember("Item", $both, $null, $coll, $argv)
      return ,$r
    } catch { throw (ComCore-ErrText $first) }
  }
}

function ComCore-Set($obj, [string]$name, [object[]]$argv, $value) {
  $all = @($argv) + @(ComCore-NormArg $value)
  [void]$obj.GetType().InvokeMember($name, [Reflection.BindingFlags]::SetProperty, $null, $obj, $all)
}

function ComCore-Out($v, [int]$depth = 0) {
  if ($null -eq $v) { return $null }
  if ($v -is [string] -or $v -is [bool] -or $v -is [char]) { return $v }
  if ($v -is [int] -or $v -is [long] -or $v -is [int16] -or $v -is [byte] -or $v -is [double] -or $v -is [single] -or $v -is [decimal] -or $v -is [uint32] -or $v -is [uint16]) { return $v }
  if ($v -is [datetime]) { return $v.ToString("o") }
  if ($v -is [System.__ComObject]) {
    $tn = "object"
    try { $tn = [Microsoft.VisualBasic.Information]::TypeName($v) } catch {}
    return @{ object = $tn }
  }
  if ($v -is [array]) {
    if ($depth -gt 0) { return "[array]" }
    $list = New-Object System.Collections.ArrayList
    foreach ($x in $v) { if ($list.Count -ge 200) { break }; [void]$list.Add((ComCore-Out $x 1)) }
    return ,$list.ToArray()
  }
  return [string]$v
}

# walk segments from $start (exclusive of the last $skipLast segments)
function ComCore-Walk($obj, $segs, [int]$from, [int]$to) {
  $o = $obj
  for ($i = $from; $i -lt $to; $i++) {
    if ($null -eq $o) { throw "null before '$($segs[$i].name)'" }
    $o = ComCore-Get $o $segs[$i].name $segs[$i].args
  }
  return ,$o
}

function ComCore-Has($o, [string]$n) { return ($null -ne $o) -and ($o.PSObject.Properties.Name -contains $n) }

# a: {progId, attach, steps?: [{path, args?, setValue?, save?, each?}], path?, args?, setValue?, continueOnError?}
function ComCore-Run($a) {
  $steps = @()
  if ((ComCore-Has $a "steps") -and $a.steps) { $steps = @($a.steps) }
  else {
    $one = @{ path = [string]$a.path }
    if ((ComCore-Has $a "args") -and $a.args) { $one.args = @($a.args) }
    if (ComCore-Has $a "setValue") { $one.setValue = $a.setValue }
    $steps = @([pscustomobject]$one)
  }
  if ($a.attach) { $root = [Runtime.InteropServices.Marshal]::GetActiveObject([string]$a.progId) }
  else { $root = New-Object -ComObject ([string]$a.progId) }
  $handles = @{}
  $results = New-Object System.Collections.ArrayList
  $allOk = $true
  for ($si = 0; $si -lt $steps.Count; $si++) {
    $st = $steps[$si]
    $path = [string]$st.path
    try {
      $segs = ComCore-SplitPath $path
      $start = 0; $base = $root
      if ($segs[0].name.StartsWith('$')) {
        $hn = $segs[0].name.Substring(1)
        if (-not $handles.ContainsKey($hn)) { throw "unknown handle '$hn'" }
        $base = $handles[$hn]; $start = 1
      }
      $n = $segs.Count
      if (ComCore-Has $st "each") {
        $coll = ComCore-Walk $base $segs $start $n
        $max = 200
        if ((ComCore-Has $st.each "max") -and $st.each.max) { $max = [Math]::Min([int]$st.each.max, 20000) }
        $props = @($st.each.props)
        $rows = New-Object System.Collections.ArrayList
        $count = 0; $truncated = $false
        foreach ($item in $coll) {
          if ($rows.Count -ge $max) {
            $truncated = $true
            try { $count = [int]$coll.Count } catch { $count = -1 }
            break
          }
          $count++
          $row = [ordered]@{}
          foreach ($pp in $props) {
            try { $ps2 = ComCore-SplitPath ([string]$pp); $row[[string]$pp] = ComCore-Out (ComCore-Walk $item $ps2 0 $ps2.Count) }
            catch { $row[[string]$pp] = "!" + (ComCore-ErrText $_) }
          }
          [void]$rows.Add($row)
        }
        [void]$results.Add(@{ i = $si; path = $path; ok = $true; result = @{ count = $count; truncated = $truncated; rows = $rows.ToArray() } })
        continue
      }
      if ($n - $start -lt 1) {
        $final = $base
      } else {
        $parent = ComCore-Walk $base $segs $start ($n - 1)
        $last = $segs[$n - 1]
        if (ComCore-Has $st "setValue") {
          ComCore-Set $parent $last.name $last.args $st.setValue
          [void]$results.Add(@{ i = $si; path = $path; ok = $true; result = "set" })
          continue
        }
        $argv = @($last.args)
        if ((ComCore-Has $st "args") -and $st.args) { foreach ($x in @($st.args)) { $argv += ,(ComCore-NormArg $x) } }
        $final = ComCore-Get $parent $last.name $argv
      }
      if ((ComCore-Has $st "save") -and $st.save) { $handles[[string]$st.save] = $final }
      [void]$results.Add(@{ i = $si; path = $path; ok = $true; result = (ComCore-Out $final) })
    } catch {
      $allOk = $false
      [void]$results.Add(@{ i = $si; path = $path; ok = $false; error = (ComCore-ErrText $_) })
      if (-not ((ComCore-Has $a "continueOnError") -and $a.continueOnError)) { break }
    }
  }
  return @{ ok = $allOk; steps = $results.ToArray() }
}
# <<< com-core

function Invoke-ComMain($a) {
  try {
    $r = ComCore-Run $a
    if ($r.ok) { return @{ ok = $true; detail = $r } }
    $bad = @($r.steps | Where-Object { -not $_.ok } | Select-Object -First 1)
    $msg = if ($bad.Count -gt 0) { "step $($bad[0].i) ($($bad[0].path)): $($bad[0].error)" } else { "failed" }
    return @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "invoke-com"; message = $msg }; detail = $r }
  } catch {
    return @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "invoke-com"; message = (ComCore-ErrText $_) } }
  }
}

# IF-30: read-only file access under program folders only
$AllowRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:CommonProgramFiles, ${env:CommonProgramFiles(x86)}, (Join-Path $env:SystemRoot "System32"), (Join-Path $env:SystemRoot "SysWOW64")) |
  Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar }
function Resolve-Allowed([string]$p) {
  if (-not $p) { throw "path is required" }
  $f = [IO.Path]::GetFullPath($p)
  foreach ($r in $AllowRoots) { if ($f.StartsWith($r, [StringComparison]::OrdinalIgnoreCase) -or ($f + [IO.Path]::DirectorySeparatorChar) -ieq $r) { return $f } }
  throw "path not allowed (program folders only): $f"
}
function Get-Listing([string]$p) {
  $f = Resolve-Allowed $p
  if (-not [IO.Directory]::Exists($f)) { throw "not a directory: $f" }
  $items = New-Object System.Collections.ArrayList
  foreach ($d in [IO.Directory]::GetDirectories($f)) { if ($items.Count -ge 5000) { break }; [void]$items.Add(@{ name = [IO.Path]::GetFileName($d); dir = $true }) }
  foreach ($x in [IO.Directory]::GetFiles($f)) { if ($items.Count -ge 5000) { break }; [void]$items.Add(@{ name = [IO.Path]::GetFileName($x); dir = $false; size = (New-Object IO.FileInfo $x).Length }) }
  return @{ ok = $true; path = $f; items = $items.ToArray() }
}

# 조작 하나를 별도 STA 런스페이스에서 시간제한을 두고 실행한다.
# 보호된 보기의 Word 등으로 COM 호출이 멈춰도 에이전트 전체가 물리지 않게 한다.
function Invoke-WithTimeout($action, [int]$timeoutMs) {
  $ps = [PowerShell]::Create()
  $ps.Runspace = [RunspaceFactory]::CreateRunspace()
  $ps.Runspace.ApartmentState = "STA"
  $ps.Runspace.Open()
  [void]$ps.AddScript({
    param($action)
    Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class NativeWin2 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetForegroundWindow(IntPtr h);
  public const uint WM_COMMAND = 0x0111;
}
"@
    function Invoke-Window($a) {
      $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq [string]$a.target) })
      $h = ($procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
      if (-not $h) { return @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-window"; message = "대상의 최상위 창을 찾지 못했습니다." } } }
      if ($a.mode -eq "wm_command") { [void][NativeWin2]::SendMessage($h, [NativeWin2]::WM_COMMAND, [IntPtr][int]$a.commandId, [IntPtr]::Zero); return @{ ok = $true; detail = @{ ok = $true; mode = "wm_command"; commandId = [int]$a.commandId } } }
      elseif ($a.mode -eq "keys") { [void][NativeWin2]::SetForegroundWindow($h); Start-Sleep -Milliseconds 150; if ([NativeWin2]::GetForegroundWindow() -ne $h) { return @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-window"; message = "target window did not become foreground; keys were not sent" } } }; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([string]$a.keys); return @{ ok = $true; detail = @{ ok = $true; mode = "keys"; keys = [string]$a.keys } } }
      return @{ ok = $false; limitation = @{ code = "E_PARSE"; collector = "invoke-window"; message = "알 수 없는 mode" } }
    }
    function Invoke-Uia($a) {
      Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
      $AE = [System.Windows.Automation.AutomationElement]
      $tgt = [string]$a.target
      if ($tgt -match '[\\/]') { $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $tgt) } | ForEach-Object { $_.Id }) }
      else { $base = $tgt -replace '\.exe$', ''; $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -ieq $base } | ForEach-Object { $_.Id }) }
      if ($procIds.Count -eq 0) { return @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-uia"; message = "대상이 실행 중이 아닙니다." } } }
      $wantName = [string]$a.name; $wantId = [string]$a.automationId; $wantType = [string]$a.controlType
      $found = New-Object System.Collections.ArrayList
      foreach ($procId in $procIds) {
        $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $procId)
        $wins = $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
        $all = New-Object System.Collections.ArrayList
        foreach ($w in $wins) { foreach ($d in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) { [void]$all.Add($d) } }
        foreach ($e in $all) {
          try {
            $cc = $e.Current
            $type = $cc.ControlType.ProgrammaticName -replace '^ControlType\.', ''
            $nOk = (-not $wantName) -or ($cc.Name -and $cc.Name.ToLower().Contains($wantName.ToLower()))
            $iOk = (-not $wantId) -or ($cc.AutomationId -eq $wantId)
            $tOk = (-not $wantType) -or ($type -eq $wantType)
            if ($nOk -and $iOk -and $tOk) { [void]$found.Add($e) }
          } catch {}
        }
      }
      if ($found.Count -eq 0) { return @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-uia"; message = "조건에 맞는 요소를 찾지 못했습니다." } } }
      if ($a.list) {
        $items = New-Object System.Collections.ArrayList
        foreach ($e in $found) {
          if ($items.Count -ge 80) { break }
          try {
            $cc = $e.Current
            $pats = @($e.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers\.Pattern$', '' })
            [void]$items.Add(@{ name = [string]$cc.Name; controlType = ($cc.ControlType.ProgrammaticName -replace '^ControlType\.', ''); automationId = [string]$cc.AutomationId; patterns = $pats })
          } catch {}
        }
        return @{ ok = $true; detail = @{ list = $true; count = $found.Count; elements = $items.ToArray() } }
      }
      $nth = if ($a.PSObject.Properties.Name -contains "nth") { [int]$a.nth } else { 0 }
      if ($nth -ge $found.Count) { $nth = 0 }
      $el = $found[$nth]; $cur = $el.Current
      $pattern = if ($a.pattern) { [string]$a.pattern } else { "Invoke" }
      switch ($pattern) {
        "Invoke" { ($el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke() }
        "Toggle" { ($el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)).Toggle() }
        "Expand" { ($el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand() }
        "Collapse" { ($el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Collapse() }
        "Select" { ($el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)).Select() }
        "Value" { ($el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue([string]$a.value) }
        default { throw "알 수 없는 pattern: $pattern" }
      }
      return @{ ok = $true; detail = @{ pattern = $pattern; name = [string]$cur.Name; automationId = [string]$cur.AutomationId; matchCount = $found.Count } }
    }
    function Invoke-Type($a) {
      Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class TyperA {
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] p, int cb);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
  static INPUT Key(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
  static void Send(INPUT[] a) { SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }
  public static void TypeText(string s) { foreach (char c in s) { Send(new INPUT[] { Key(0, c, 0x0004), Key(0, c, 0x0006) }); } }
  public static void Vk(ushort vk, bool ctrl) { var l = new System.Collections.Generic.List<INPUT>(); if (ctrl) l.Add(Key(0x11,0,0)); l.Add(Key(vk,0,0)); l.Add(Key(vk,0,0x0002)); if (ctrl) l.Add(Key(0x11,0,0x0002)); Send(l.ToArray()); }
  public static void Click(int x, int y) { SetCursorPos(x, y); System.Threading.Thread.Sleep(120); mouse_event(0x0002,0,0,0,IntPtr.Zero); mouse_event(0x0004,0,0,0,IntPtr.Zero); }
}
"@
      $clear = -not ($a.PSObject.Properties.Name -contains "clear" -and -not $a.clear)
      if (($a.PSObject.Properties.Name -contains "x") -and ($a.PSObject.Properties.Name -contains "y")) { [TyperA]::Click([int]$a.x, [int]$a.y); Start-Sleep -Milliseconds 200 }
      if ($clear) { [TyperA]::Vk(0x41, $true); Start-Sleep -Milliseconds 60; [TyperA]::Vk(0x2E, $false); Start-Sleep -Milliseconds 60 }
      [TyperA]::TypeText([string]$a.text); Start-Sleep -Milliseconds 150
      if ($a.PSObject.Properties.Name -contains "enter" -and $a.enter) { [TyperA]::Vk(0x0D, $false) }
      return @{ ok = $true; detail = @{ ok = $true; typed = ([string]$a.text).Length; cleared = $clear; sent = [bool]$a.enter } }
    }
    function Invoke-Click($a) {
      Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class ClkN {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, IntPtr e);
}
"@
      $bx = if ([string]$a.button -eq "right") { 0x0008 } else { 0x0002 }
      $bu = if ([string]$a.button -eq "right") { 0x0010 } else { 0x0004 }
      [ClkN]::SetCursorPos([int]$a.x, [int]$a.y); Start-Sleep -Milliseconds 120
      $times = if ($a.double) { 2 } else { 1 }
      for ($i = 0; $i -lt $times; $i++) { [ClkN]::mouse_event($bx, 0, 0, 0, [IntPtr]::Zero); [ClkN]::mouse_event($bu, 0, 0, 0, [IntPtr]::Zero); if ($times -gt 1) { Start-Sleep -Milliseconds 80 } }
      return @{ ok = $true; detail = @{ ok = $true; x = [int]$a.x; y = [int]$a.y } }
    }
    function Invoke-Screenshot($a) {
      Add-Type -AssemblyName System.Drawing, System.Windows.Forms
      if ($a.region) { $x = [int]$a.region.x; $y = [int]$a.region.y; $w = [int]$a.region.w; $h = [int]$a.region.h }
      else { $vs = [System.Windows.Forms.SystemInformation]::VirtualScreen; $x = $vs.X; $y = $vs.Y; $w = $vs.Width; $h = $vs.Height }
      $bmp = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
      $ms = New-Object IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      $b64 = [Convert]::ToBase64String($ms.ToArray())
      return @{ ok = $true; detail = @{ ok = $true; w = $w; h = $h; bytes = $ms.Length; base64 = $b64 } }
    }
    switch ([string]$action.kind) {
      "window" { Invoke-Window $action }
      "type" { Invoke-Type $action }
      "uia" { Invoke-Uia $action }
      "click" { Invoke-Click $action }
      "screenshot" { Invoke-Screenshot $action }
      default { @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "agent"; message = "window/uia/click/screenshot만 이 경로로 실행합니다 (com은 메인 스레드)." } } }
    }
  }).AddArgument($action)
  $async = $ps.BeginInvoke()
  if ($async.AsyncWaitHandle.WaitOne($timeoutMs)) {
    try { $r = $ps.EndInvoke($async) } catch { $r = $null; $err = $_.Exception.InnerException.Message }
    $ps.Runspace.Close(); $ps.Dispose()
    if ($err) { return @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "agent"; message = $err } } }
    if ($r -and $r.Count -ge 1) { return $r[0] }
    return @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "agent"; message = "결과가 없습니다." } }
  } else {
    $ps.Stop(); $ps.Dispose()
    return @{ ok = $false; limitation = @{ code = "E_TIMEOUT"; collector = "agent"; message = "조작이 ${timeoutMs}ms 안에 끝나지 않았습니다. 대상이 응답 대기 중일 수 있습니다(예: Word 보호된 보기 — '편집 사용'을 누르세요)." } }
  }
}

# 바인딩 주소: loopback + 이 노드의 Tailscale IP
$prefixes = @("http://127.0.0.1:$Port/")
$tsExe = "C:\Program Files\Tailscale\tailscale.exe"
$tsIp = $null
if (Test-Path $tsExe) { $tsIp = (& $tsExe ip -4 2>$null | Select-Object -First 1); if ($tsIp) { $tsIp = $tsIp.Trim(); $prefixes += "http://${tsIp}:$Port/" } }

$listener = New-Object System.Net.HttpListener
$prefixes | ForEach-Object { $listener.Prefixes.Add($_) }
try { $listener.Start() }
catch {
  Write-Host "리스너 시작 실패. 관리자 PowerShell에서 아래를 한 번 실행한 뒤 다시 시도하세요:"
  foreach ($p in $prefixes) { Write-Host "  netsh http add urlacl url=$p user=$env:USERNAME" }
  throw
}
Write-Host "REA 에이전트 실행 중 (버전 $AgentVersion): $($prefixes -join ', ')"
Write-Host "조작하는 쪽에서: apphelm invoke-com ... --host $(if($tsIp){$tsIp}else{'127.0.0.1'})  (토큰 일치 필요)"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $resp = $ctx.Response
  $out = @{ error = "?" }
  try {
    if ($req.Headers["x-rea-token"] -ne $Token) {
      $resp.StatusCode = 401; $out = @{ error = "토큰이 올바르지 않습니다." }
    } elseif ($req.Url.AbsolutePath -eq "/health") {
      $out = @{ ok = $true; node = $env:COMPUTERNAME; version = $AgentVersion; capabilities = @("com", "com-steps", "com-each", "window", "uia", "type", "click", "screenshot", "list", "file") }
    } elseif ($req.Url.AbsolutePath -eq "/list") {
      $out = Get-Listing ([string]$req.QueryString["path"])
    } elseif ($req.Url.AbsolutePath -eq "/file") {
      $fp = Resolve-Allowed ([string]$req.QueryString["path"])
      if (-not [IO.File]::Exists($fp)) { throw "file not found: $fp" }
      $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $fp).Hash.ToLowerInvariant()
      $fs = [IO.File]::OpenRead($fp)
      $flen = $fs.Length
      try {
        $resp.ContentType = "application/octet-stream"
        $resp.ContentLength64 = $fs.Length
        $resp.AddHeader("X-Sha256", $sha)
        $fs.CopyTo($resp.OutputStream, 1048576)
      } finally { $fs.Close() }
      Write-Host "file: $fp ($flen bytes)"
      $out = $null
    } elseif ($req.Url.AbsolutePath -eq "/invoke" -and $req.HttpMethod -eq "POST") {
      $body = (New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)).ReadToEnd()
      $parsed = $body | ConvertFrom-Json
      Write-Host "invoke: $($parsed.action.kind) $($parsed.action.path)$($parsed.action.commandId) steps=$(@($parsed.action.steps).Count)"
      if ([string]$parsed.action.kind -eq "com") { $out = Invoke-ComMain $parsed.action }
      else { $out = Invoke-WithTimeout $parsed.action 25000 }
    } else {
      $resp.StatusCode = 404; $out = @{ error = "알 수 없는 경로" }
    }
  } catch {
    try { $resp.StatusCode = 500 } catch {}; $out = @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "agent"; message = $_.Exception.Message } }
  }
  try {
    if ($null -ne $out) {
      $json = ConvertTo-Json -InputObject $out -Depth 12 -Compress
      $buf = [Text.Encoding]::UTF8.GetBytes($json)
      $resp.ContentType = "application/json; charset=utf-8"
      $resp.OutputStream.Write($buf, 0, $buf.Length)
    }
    $resp.OutputStream.Close()
  } catch { Write-Host "response write failed: $($_.Exception.Message)" }
}

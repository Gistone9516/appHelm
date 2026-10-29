# IF-20: UI Automation snapshot of the top-level windows of the running target and its descendant processes. Reads only; expands nothing.
# ASCII only (IF-21). Input: i.json {target, maxDepth, maxElements, timeoutMs}. Output: o.json.
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
  $script:maxDepth = [int]$p.maxDepth
  $script:maxElements = [int]$p.maxElements
  $script:timeoutMs = [int]$p.timeoutMs
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $A = [System.Windows.Automation.AutomationElement]
  $script:walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $script:sw = [Diagnostics.Stopwatch]::StartNew()
  $script:elements = New-Object System.Collections.ArrayList
  $script:truncated = $false

  function Walk($el, [string]$path, [int]$depth) {
    if ($script:elements.Count -ge $script:maxElements -or $script:sw.ElapsedMilliseconds -ge $script:timeoutMs) { $script:truncated = $true; return }
    $child = $script:walker.GetFirstChild($el)
    while ($child) {
      if ($script:elements.Count -ge $script:maxElements -or $script:sw.ElapsedMilliseconds -ge $script:timeoutMs) { $script:truncated = $true; return }
      try {
        $cur = $child.Current
        $type = $cur.ControlType.ProgrammaticName -replace '^ControlType\.', ''
        $pats = @($child.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers\.Pattern$', '' })
        $name = [string]$cur.Name
        $label = if ($name) { $name } else { $type }
        $row = @{ path = "$path > $label"; controlType = $type; name = $name; patterns = $pats }
        if ($cur.AutomationId) { $row.automationId = [string]$cur.AutomationId }
        [void]$script:elements.Add($row)
        if ($depth + 1 -lt $script:maxDepth) { Walk $child "$path > $label" ($depth + 1) }
      } catch {}
      $child = $script:walker.GetNextSibling($child)
    }
  }

  $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $target) } | ForEach-Object { $_.Id })
  # IF-20: descendants by parent pid only (CEF apps keep their windows in a child helper process)
  $scope = New-Object System.Collections.ArrayList
  foreach ($id in $procIds) { [void]$scope.Add([int]$id) }
  if ($procIds.Count -gt 0) {
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId)
    $i = 0
    while ($i -lt $scope.Count) {
      $parent = $scope[$i]
      foreach ($c in $all) { if ([int]$c.ParentProcessId -eq $parent -and -not $scope.Contains([int]$c.ProcessId)) { [void]$scope.Add([int]$c.ProcessId) } }
      $i++
    }
  }
  $windows = New-Object System.Collections.ArrayList
  $minimized = New-Object System.Collections.ArrayList
  foreach ($procId in $scope) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $procId)
    foreach ($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
      $title = [string]$w.Current.Name
      [void]$windows.Add($title)
      try {
        $wp = $w.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
        if ($wp.Current.WindowVisualState -eq [System.Windows.Automation.WindowVisualState]::Minimized) { [void]$minimized.Add($title) }
      } catch {}
      Walk $w $title 0
    }
  }
  # F-35: windows cloaked by the shell (another virtual desktop) are left out of the UIA tree. Name them so the caller is not told "no window".
  $cloaked = New-Object System.Collections.ArrayList
  if ($windows.Count -eq 0 -and $scope.Count -gt 0) {
    Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class Cloak {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  public static List<string> Titles(int[] pids) {
    var set = new HashSet<uint>(); foreach (var p in pids) set.Add((uint)p);
    var o = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (!set.Contains(p) || !IsWindowVisible(h)) return true;
      int v; DwmGetWindowAttribute(h, 14, out v, 4); if (v == 0) return true;
      var s = new StringBuilder(256); GetWindowText(h, s, 256); if (s.Length > 0) o.Add(s.ToString()); return true; }, IntPtr.Zero);
    return o;
  }
}
"@
    foreach ($t in [Cloak]::Titles([int[]]@($scope.ToArray()))) { [void]$cloaked.Add($t) }
  }
  Save @{ running = ($procIds.Count -gt 0); session = (Get-Process -Id $PID).SessionId; windows = @($windows.ToArray()); minimized = @($minimized.ToArray()); cloaked = @($cloaked.ToArray()); elements = @($script:elements.ToArray()); truncated = $script:truncated }
} catch {
  Save @{ error = $_.Exception.Message }
}

# IF-20: UI Automation snapshot of the running target's top-level windows. Reads only; expands nothing.
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
  $windows = New-Object System.Collections.ArrayList
  foreach ($procId in $procIds) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $procId)
    foreach ($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
      $title = [string]$w.Current.Name
      [void]$windows.Add($title)
      Walk $w $title 0
    }
  }
  Save @{ running = ($procIds.Count -gt 0); session = (Get-Process -Id $PID).SessionId; windows = @($windows.ToArray()); elements = @($script:elements.ToArray()); truncated = $script:truncated }
} catch {
  Save @{ error = $_.Exception.Message }
}

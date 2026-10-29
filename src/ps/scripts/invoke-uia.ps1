# Operate layer (UIA): find an element in the running target's windows and run a pattern (click, toggle, set value).
# ASCII only (IF-21). Input i.json: { target, name?, automationId?, controlType?, pattern?, value?, nth? }
#   pattern: Invoke (default) | Toggle | Expand | Collapse | Select | Value
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
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $A = [System.Windows.Automation.AutomationElement]
  $tgt = [string]$p.target
  if ($tgt -match '[\\/]') { $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq $tgt) } | ForEach-Object { $_.Id }) }
  else { $base = $tgt -replace '\.exe$', ''; $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -ieq $base } | ForEach-Object { $_.Id }) }
  if ($procIds.Count -eq 0) { Save @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-uia"; message = "target is not running" } }; return }

  $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId)
  $scope = New-Object System.Collections.ArrayList
  foreach ($id in $procIds) { [void]$scope.Add([int]$id) }
  $i = 0
  while ($i -lt $scope.Count) { $parent = $scope[$i]; foreach ($c in $all) { if ([int]$c.ParentProcessId -eq $parent -and -not $scope.Contains([int]$c.ProcessId)) { [void]$scope.Add([int]$c.ProcessId) } }; $i++ }
  $procIds = @($scope.ToArray())

  $wantName = [string]$p.name; $wantId = [string]$p.automationId; $wantType = [string]$p.controlType
  $matches = New-Object System.Collections.ArrayList
  # query Descendants per top-level window (fast), then filter in PowerShell. IF-20: include descendant processes (CEF helpers)
  foreach ($procId in $procIds) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, [int]$procId)
    $wins = $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
    $all = New-Object System.Collections.ArrayList
    foreach ($w in $wins) {
      $desc = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      foreach ($d in $desc) { [void]$all.Add($d) }
    }
    foreach ($e in $all) {
      try {
        $c = $e.Current
        $type = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
        $nameOk = (-not $wantName) -or ($c.Name -and $c.Name.ToLower().Contains($wantName.ToLower()))
        $idOk = (-not $wantId) -or ($c.AutomationId -eq $wantId)
        $typeOk = (-not $wantType) -or ($type -eq $wantType)
        if ($nameOk -and $idOk -and $typeOk) { [void]$matches.Add($e) }
      } catch {}
    }
  }
  if ($matches.Count -eq 0) { Save @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-uia"; message = "no element matches the conditions" } }; return }
  if ($p.list) {
    $items = New-Object System.Collections.ArrayList
    foreach ($e in $matches) {
      if ($items.Count -ge 80) { break }
      try {
        $c = $e.Current
        $pats = @($e.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers\.Pattern$', '' })
        [void]$items.Add(@{ name = [string]$c.Name; controlType = ($c.ControlType.ProgrammaticName -replace '^ControlType\.', ''); automationId = [string]$c.AutomationId; patterns = $pats })
      } catch {}
    }
    Save @{ ok = $true; detail = @{ list = $true; count = $matches.Count; elements = $items.ToArray() } }; return
  }
  $nth = if ($p.PSObject.Properties.Name -contains "nth") { [int]$p.nth } else { 0 }
  if ($nth -ge $matches.Count) { $nth = 0 }
  $el = $matches[$nth]
  $cur = $el.Current
  $pattern = if ($p.pattern) { [string]$p.pattern } else { "Invoke" }

  switch ($pattern) {
    "Invoke" { ($el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke() }
    "Toggle" { ($el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)).Toggle() }
    "Expand" { ($el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand() }
    "Collapse" { ($el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Collapse() }
    "Select" { ($el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)).Select() }
    "Value" { ($el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue([string]$p.value) }
    default { throw "unknown pattern: $pattern" }
  }
  Save @{ ok = $true; detail = @{ pattern = $pattern; name = [string]$cur.Name; automationId = [string]$cur.AutomationId; controlType = ($cur.ControlType.ProgrammaticName -replace '^ControlType\.', ''); matchCount = $matches.Count } }
} catch {
  Save @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "invoke-uia"; message = $_.Exception.Message } }
}

# 실행 계층(UIA): 실행 중인 대상 창에서 요소를 찾아 패턴을 실행한다(클릭·토글·값설정).
# ASCII only (IF-21). Input i.json: { target, name?, automationId?, controlType?, pattern?, value?, nth? }
#   pattern: Invoke(기본) | Toggle | Expand | Collapse | Select | Value
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
  $procIds = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq [string]$p.target) } | ForEach-Object { $_.Id })
  if ($procIds.Count -eq 0) { Save @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-uia"; message = "대상이 실행 중이 아닙니다." } }; return }

  $wantName = [string]$p.name; $wantId = [string]$p.automationId; $wantType = [string]$p.controlType
  $matches = New-Object System.Collections.ArrayList
  foreach ($procId in $procIds) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $procId)
    foreach ($w in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
      # 트리 워커가 내용 창을 못 뚫는 경우가 있어 Descendants 전체를 가져와 PowerShell에서 거른다
      $all = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
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
  }
  if ($matches.Count -eq 0) { Save @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-uia"; message = "조건에 맞는 요소를 찾지 못했습니다." } }; return }
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
    default { throw "알 수 없는 pattern: $pattern" }
  }
  Save @{ ok = $true; detail = @{ pattern = $pattern; name = [string]$cur.Name; automationId = [string]$cur.AutomationId; controlType = ($cur.ControlType.ProgrammaticName -replace '^ControlType\.', ''); matchCount = $matches.Count } }
} catch {
  Save @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "invoke-uia"; message = $_.Exception.Message } }
}

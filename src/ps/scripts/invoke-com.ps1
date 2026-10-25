# 실행 계층: COM 객체의 속성 경로를 따라가 메서드를 호출하거나 속성을 설정한다.
# ASCII only (IF-21). Input i.json: { progId, attach, path, args?, setValue?, maxReturn? }
#   path   예: "Selection.TypeText" (메서드) 또는 "Selection.Font.Bold" (설정은 setValue와 함께)
#   attach 이미 떠 있는 인스턴스에 붙는다(GetActiveObject). 실패 시 생성으로 넘어가지 않는다.
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
  $progId = [string]$p.progId
  $segments = @($p.path -split '\.')
  $args2 = @(); if ($p.PSObject.Properties.Name -contains "args" -and $p.args) { $args2 = @($p.args) }

  if ($p.attach) {
    $root = [Runtime.InteropServices.Marshal]::GetActiveObject($progId)
  } else {
    $t = [Type]::GetTypeFromProgID($progId)
    if (-not $t) { throw "ProgID를 찾을 수 없습니다: $progId" }
    $root = [Activator]::CreateInstance($t)
  }

  # 마지막 세그먼트 전까지 속성으로 따라간다
  $obj = $root
  for ($i = 0; $i -lt $segments.Count - 1; $i++) {
    $obj = $obj.GetType().InvokeMember($segments[$i], [Reflection.BindingFlags]::GetProperty, $null, $obj, @())
  }
  $last = $segments[$segments.Count - 1]

  if ($p.PSObject.Properties.Name -contains "setValue") {
    [void]$obj.GetType().InvokeMember($last, [Reflection.BindingFlags]::SetProperty, $null, $obj, @($p.setValue))
    Save @{ ok = $true; action = "set"; path = $p.path }
  } else {
    $ret = $obj.GetType().InvokeMember($last, [Reflection.BindingFlags]::InvokeMethod, $null, $obj, $args2)
    $retStr = if ($null -ne $ret) { [string]$ret } else { $null }
    Save @{ ok = $true; action = "invoke"; path = $p.path; result = $retStr }
  }
} catch {
  Save @{ error = $_.Exception.Message }
}

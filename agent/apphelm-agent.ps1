# AppHelm - 설치가 필요 없는 원격 에이전트 (Windows 기본 PowerShell/.NET만 사용)
# 노트북 등 원격 노드에서 "직접" 실행하세요. 그 세션에서 COM·창 조작을 합니다.
#   사용법:  powershell -ExecutionPolicy Bypass -File apphelm-agent.ps1 -Token <토큰> [-Port 47817]
# 조작하는 쪽(.53)에서:  $env:APPHELM_TOKEN="<토큰>"; apphelm invoke-com ... --host <이 노드>
param([string]$Token, [int]$Port = 47817)
$ErrorActionPreference = "Stop"
$AgentVersion = "2026-10-25.5-com"  # 조작하는 쪽이 /health로 버전을 확인한다
if (-not $Token) { Write-Error "토큰이 필요합니다: -Token <값>"; exit 1 }

# COM은 에이전트 메인 스레드(STA)에서 직접 실행한다. 자식 런스페이스에서는 COM 지연바인딩이
# 값을 돌려주지 못하는 문제가 있었다(측정 2026-10-25). 메인 스레드라 멈춤 위험은 있으나,
# 보호된 보기 등은 UIA로 먼저 풀어 COM 블록을 피한다.
function Invoke-ComMain($a) {
  try {
    $segments = @($a.path -split '\.')
    if ($a.attach) { $root = [Runtime.InteropServices.Marshal]::GetActiveObject([string]$a.progId) }
    else { $root = New-Object -ComObject ([string]$a.progId) }
    $obj = $root
    for ($i = 0; $i -lt $segments.Count - 1; $i++) {
      $obj = $obj.GetType().InvokeMember($segments[$i], [Reflection.BindingFlags]::GetProperty, $null, $obj, @())
    }
    $last = $segments[$segments.Count - 1]
    if ($a.PSObject.Properties.Name -contains "setValue") {
      [void]$obj.GetType().InvokeMember($last, [Reflection.BindingFlags]::SetProperty, $null, $obj, @($a.setValue))
      return @{ ok = $true; detail = @{ ok = $true; action = "set"; path = $a.path } }
    }
    $args2 = @(); if ($a.PSObject.Properties.Name -contains "args" -and $a.args) { $args2 = @($a.args) }
    $flags = if ($args2.Count -gt 0) { [Reflection.BindingFlags]::InvokeMethod } else { [Reflection.BindingFlags]'InvokeMethod,GetProperty' }
    $ret = $obj.GetType().InvokeMember($last, $flags, $null, $obj, $args2)
    $retStr = if ($null -ne $ret) { [string]$ret } else { $null }
    return @{ ok = $true; detail = @{ ok = $true; action = "invoke"; path = $a.path; result = $retStr } }
  } catch {
    return @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "invoke-com"; message = $_.Exception.Message } }
  }
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
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetForegroundWindow(IntPtr h);
  public const uint WM_COMMAND = 0x0111;
}
"@
    function Invoke-Com($a) {
      $segments = @($a.path -split '\.')
      if ($a.attach) { $root = [Runtime.InteropServices.Marshal]::GetActiveObject([string]$a.progId) }
      else { $t = [Type]::GetTypeFromProgID([string]$a.progId); if (-not $t) { throw "ProgID를 찾을 수 없습니다: $($a.progId)" }; $root = [Activator]::CreateInstance($t) }
      $obj = $root
      for ($i = 0; $i -lt $segments.Count - 1; $i++) { $obj = $obj.GetType().InvokeMember($segments[$i], [Reflection.BindingFlags]::GetProperty, $null, $obj, @()) }
      $last = $segments[$segments.Count - 1]
      if ($a.PSObject.Properties.Name -contains "setValue") {
        [void]$obj.GetType().InvokeMember($last, [Reflection.BindingFlags]::SetProperty, $null, $obj, @($a.setValue))
        return @{ ok = $true; detail = @{ ok = $true; action = "set"; path = $a.path } }
      }
      $args2 = @(); if ($a.PSObject.Properties.Name -contains "args" -and $a.args) { $args2 = @($a.args) }
      # 인자가 없으면 메서드/속성 모두 허용(GetProperty 겸용) → Version·Name 같은 속성도 값을 돌려받는다
      $flags = if ($args2.Count -gt 0) { [Reflection.BindingFlags]::InvokeMethod } else { [Reflection.BindingFlags]'InvokeMethod,GetProperty' }
      $ret = $obj.GetType().InvokeMember($last, $flags, $null, $obj, $args2)
      $retStr = if ($null -ne $ret) { [string]$ret } else { $null }
      return @{ ok = $true; detail = @{ ok = $true; action = "invoke"; path = $a.path; result = $retStr } }
    }
    function Invoke-Window($a) {
      $procs = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ($_.Path -ieq [string]$a.target) })
      $h = ($procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
      if (-not $h) { return @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "invoke-window"; message = "대상의 최상위 창을 찾지 못했습니다." } } }
      if ($a.mode -eq "wm_command") { [void][NativeWin2]::SendMessage($h, [NativeWin2]::WM_COMMAND, [IntPtr][int]$a.commandId, [IntPtr]::Zero); return @{ ok = $true; detail = @{ ok = $true; mode = "wm_command"; commandId = [int]$a.commandId } } }
      elseif ($a.mode -eq "keys") { [void][NativeWin2]::SetForegroundWindow($h); Start-Sleep -Milliseconds 150; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([string]$a.keys); return @{ ok = $true; detail = @{ ok = $true; mode = "keys"; keys = [string]$a.keys } } }
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
    switch ([string]$action.kind) {
      "com" { Invoke-Com $action }
      "window" { Invoke-Window $action }
      "uia" { Invoke-Uia $action }
      default { @{ ok = $false; limitation = @{ code = "E_NOT_APPLICABLE"; collector = "agent"; message = "com/window/uia만 지원합니다." } } }
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
      $out = @{ ok = $true; node = $env:COMPUTERNAME; version = $AgentVersion; capabilities = @("com", "window", "uia") }
    } elseif ($req.Url.AbsolutePath -eq "/invoke" -and $req.HttpMethod -eq "POST") {
      $body = (New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)).ReadToEnd()
      $parsed = $body | ConvertFrom-Json
      Write-Host "invoke: $($parsed.action.kind) $($parsed.action.path)$($parsed.action.commandId)"
      if ([string]$parsed.action.kind -eq "com") { $out = Invoke-ComMain $parsed.action }
      else { $out = Invoke-WithTimeout $parsed.action 25000 }
    } else {
      $resp.StatusCode = 404; $out = @{ error = "알 수 없는 경로" }
    }
  } catch {
    $resp.StatusCode = 500; $out = @{ ok = $false; limitation = @{ code = "E_PS_FAILED"; collector = "agent"; message = $_.Exception.Message } }
  }
  $json = ConvertTo-Json -InputObject $out -Depth 8 -Compress
  $buf = [Text.Encoding]::UTF8.GetBytes($json)
  $resp.ContentType = "application/json; charset=utf-8"
  $resp.OutputStream.Write($buf, 0, $buf.Length)
  $resp.OutputStream.Close()
}

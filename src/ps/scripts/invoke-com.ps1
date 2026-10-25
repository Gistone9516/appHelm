# Invoke layer: run COM steps (IF-26..IF-28). ASCII only (IF-21).
# Input i.json: { progId, attach, steps?: [{path, args?, setValue?, save?, each?}], path?, args?, setValue?, continueOnError? }
# Output o.json: { ok, steps: [{i, path, ok, result | error}] }
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 12 -Compress
  [IO.File]::WriteAllText("$outPath.tmp", $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force "$outPath.tmp" $outPath
}

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

try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  Save (ComCore-Run $p)
} catch {
  Save @{ error = (ComCore-ErrText $_) }
}

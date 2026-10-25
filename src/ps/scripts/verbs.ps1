# IF-18: shell verbs, file associations, URL protocols and App Paths that launch the target.
# ASCII only (IF-21). Input: i.json {target}. Output: o.json.
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 8 -Compress
  $tmp = "$outPath.tmp"
  [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding $false))
  Move-Item -Force $tmp $outPath
}
function Get-ExePath([string]$cmd) {
  if (-not $cmd) { return $null }
  $c = [Environment]::ExpandEnvironmentVariables($cmd).Trim()
  if ($c.StartsWith('"')) {
    $e = $c.IndexOf('"', 1)
    if ($e -gt 1) { return $c.Substring(1, $e - 1) }
  }
  $m = [regex]::Match($c, '^(.+?\.(exe|com|bat|cmd))(\s|$)', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return ($c -split '\s+')[0]
}

try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $target = [string]$p.target
  $exeName = [IO.Path]::GetFileName($target)
  $hkcr = [Microsoft.Win32.Registry]::ClassesRoot
  $skip = @{ "CLSID" = 1; "Interface" = 1; "TypeLib" = 1; "AppID" = 1; "Wow6432Node" = 1; "Record" = 1; "Installer" = 1 }

  $verbs = New-Object System.Collections.ArrayList
  $protocols = New-Object System.Collections.ArrayList
  $progIds = @{}
  $names = $hkcr.GetSubKeyNames()
  foreach ($name in $names) {
    if ($skip.ContainsKey($name)) { continue }
    try {
      $k = $hkcr.OpenSubKey($name)
      if (-not $k) { continue }
      $shell = $k.OpenSubKey("shell")
      if (-not $shell) { continue }
      $isProtocol = $k.GetValueNames() -contains "URL Protocol"
      foreach ($verb in $shell.GetSubKeyNames()) {
        $ck = $shell.OpenSubKey("$verb\command")
        if (-not $ck) { continue }
        $cmd = [string]$ck.GetValue("")
        $exe = Get-ExePath $cmd
        if (-not $exe) { continue }
        $same = ($exe -ieq $target) -or ((-not $exe.Contains("\")) -and ($exe -ieq $exeName))
        if (-not $same) { continue }
        if ($isProtocol) { [void]$protocols.Add(@{ scheme = $name; verb = $verb; template = $cmd }) }
        else { [void]$verbs.Add(@{ progId = $name; verb = $verb; template = $cmd }); $progIds[$name] = 1 }
      }
    } catch {}
  }

  $apps = $hkcr.OpenSubKey("Applications\$exeName\shell")
  if ($apps) {
    foreach ($verb in $apps.GetSubKeyNames()) {
      $ck = $apps.OpenSubKey("$verb\command")
      if ($ck) { [void]$verbs.Add(@{ progId = "Applications\$exeName"; verb = $verb; template = [string]$ck.GetValue("") }) }
    }
  }

  # extensions whose default ProgID or OpenWithProgids points at a matched ProgID
  $exts = @{}
  foreach ($name in $names) {
    if (-not $name.StartsWith(".")) { continue }
    try {
      $k = $hkcr.OpenSubKey($name)
      if (-not $k) { continue }
      $def = [string]$k.GetValue("")
      if ($def -and $progIds.ContainsKey($def)) {
        if (-not $exts.ContainsKey($def)) { $exts[$def] = New-Object System.Collections.ArrayList }
        [void]$exts[$def].Add($name)
      }
    } catch {}
  }
  foreach ($v in $verbs) {
    # assign arrays directly: an if-expression unrolls a 1-element array to a scalar and an empty one to null
    $v.extensions = @()
    $list = $exts[$v.progId]
    if ($list) { $v.extensions = $list.ToArray() }
  }

  $appPaths = New-Object System.Collections.ArrayList
  foreach ($hive in @([Microsoft.Win32.Registry]::LocalMachine, [Microsoft.Win32.Registry]::CurrentUser)) {
    $ak = $hive.OpenSubKey("SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$exeName")
    if ($ak) {
      $exe = Get-ExePath ([string]$ak.GetValue(""))
      if ($exe -and ($exe -ieq $target)) { [void]$appPaths.Add(@{ name = $exeName; template = [string]$ak.GetValue("") }) }
    }
  }

  Save @{ verbs = @($verbs.ToArray()); protocols = @($protocols.ToArray()); appPaths = @($appPaths.ToArray()) }
} catch {
  Save @{ error = $_.Exception.Message }
}

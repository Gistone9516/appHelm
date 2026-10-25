# IF-17: find COM servers whose LocalServer32/InprocServer32 is the target, then dump their type libraries.
# ASCII only (IF-21). Input: i.json {target, maxMembers}. Output: o.json.
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
function Save($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 12 -Compress
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
  $m = [regex]::Match($c, '^(.+?\.(exe|dll|ocx|com))(\s|$)', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value }
  return ($c -split '\s+')[0]
}

try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $target = [string]$p.target
  $maxMembers = [int]$p.maxMembers

  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using CT = System.Runtime.InteropServices.ComTypes;
public static class TLD {
  [DllImport("oleaut32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void LoadTypeLibEx(string file, int regkind, out CT.ITypeLib lib);
  static readonly HashSet<string> Base = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
    "QueryInterface","AddRef","Release","GetTypeInfoCount","GetTypeInfo","GetIDsOfNames","Invoke" };
  public static List<Dictionary<string,object>> Dump(string file, int maxMembers) {
    CT.ITypeLib lib; LoadTypeLibEx(file, 2, out lib);
    var result = new List<Dictionary<string,object>>();
    int total = 0;
    int n = lib.GetTypeInfoCount();
    for (int i = 0; i < n; i++) {
      CT.ITypeInfo ti; lib.GetTypeInfo(i, out ti);
      string name, doc, hf; int hc;
      ti.GetDocumentation(-1, out name, out doc, out hc, out hf);
      IntPtr pa; ti.GetTypeAttr(out pa);
      var ta = (CT.TYPEATTR)Marshal.PtrToStructure(pa, typeof(CT.TYPEATTR));
      string kind;
      switch (ta.typekind) {
        case CT.TYPEKIND.TKIND_DISPATCH: kind = "dispatch"; break;
        case CT.TYPEKIND.TKIND_INTERFACE: kind = "interface"; break;
        case CT.TYPEKIND.TKIND_COCLASS: kind = "coclass"; break;
        case CT.TYPEKIND.TKIND_ENUM: kind = "enum"; break;
        default: kind = "other"; break;
      }
      bool hidden = ((int)ta.wTypeFlags & (int)CT.TYPEFLAGS.TYPEFLAG_FHIDDEN) != 0;
      var members = new List<Dictionary<string,object>>();
      if (kind == "dispatch" || kind == "interface") {
        for (int f = 0; f < ta.cFuncs && total < maxMembers; f++) {
          IntPtr pf; ti.GetFuncDesc(f, out pf);
          var fd = (CT.FUNCDESC)Marshal.PtrToStructure(pf, typeof(CT.FUNCDESC));
          string[] names = new string[fd.cParams + 1]; int cn;
          ti.GetNames(fd.memid, names, names.Length, out cn);
          string mname, mdoc, mhf; int mhc;
          ti.GetDocumentation(fd.memid, out mname, out mdoc, out mhc, out mhf);
          int flags = (int)fd.wFuncFlags;
          var ik = fd.invkind;
          ti.ReleaseFuncDesc(pf);
          if (cn < 1 || Base.Contains(names[0])) continue;
          if ((flags & ((int)CT.FUNCFLAGS.FUNCFLAG_FRESTRICTED | (int)CT.FUNCFLAGS.FUNCFLAG_FHIDDEN)) != 0) continue;
          string ikind = ik == CT.INVOKEKIND.INVOKE_PROPERTYGET ? "get"
            : ik == CT.INVOKEKIND.INVOKE_PROPERTYPUT ? "put"
            : ik == CT.INVOKEKIND.INVOKE_PROPERTYPUTREF ? "putref" : "method";
          var ps = new List<string>();
          for (int k = 1; k < cn; k++) ps.Add(names[k]);
          var m = new Dictionary<string,object>();
          m["name"] = names[0]; m["invokeKind"] = ikind; m["params"] = ps.ToArray();
          if (!string.IsNullOrEmpty(mdoc)) m["doc"] = mdoc;
          members.Add(m); total++;
        }
        for (int v = 0; v < ta.cVars && total < maxMembers; v++) {
          IntPtr pv; ti.GetVarDesc(v, out pv);
          var vd = (CT.VARDESC)Marshal.PtrToStructure(pv, typeof(CT.VARDESC));
          string[] vn = new string[1]; int vc;
          ti.GetNames(vd.memid, vn, 1, out vc);
          ti.ReleaseVarDesc(pv);
          if (vc < 1) continue;
          var m = new Dictionary<string,object>();
          m["name"] = vn[0]; m["invokeKind"] = "get"; m["params"] = new string[0];
          members.Add(m); total++;
        }
      }
      var impls = new List<string>();
      if (kind == "coclass") {
        for (int j = 0; j < ta.cImplTypes; j++) {
          try {
            int href; ti.GetRefTypeOfImplType(j, out href);
            CT.ITypeInfo rti; ti.GetRefTypeInfo(href, out rti);
            string iname, idoc, ihf; int ihc; rti.GetDocumentation(-1, out iname, out idoc, out ihc, out ihf);
            CT.IMPLTYPEFLAGS f; ti.GetImplTypeFlags(j, out f);
            if (((int)f & (int)CT.IMPLTYPEFLAGS.IMPLTYPEFLAG_FSOURCE) != 0) continue;
            if (((int)f & (int)CT.IMPLTYPEFLAGS.IMPLTYPEFLAG_FDEFAULT) != 0) impls.Insert(0, iname); else impls.Add(iname);
          } catch {}
        }
      }
      string guid = ta.guid.ToString("B").ToUpperInvariant();
      ti.ReleaseTypeAttr(pa);
      if (kind == "dispatch" || kind == "interface" || kind == "coclass") {
        // hidden types are kept and flagged: key interfaces such as IWebBrowser2 are hidden (F-12)
        var t = new Dictionary<string,object>();
        t["name"] = name; t["kind"] = kind; t["members"] = members.ToArray(); t["hidden"] = hidden;
        if (!string.IsNullOrEmpty(doc)) t["doc"] = doc;
        if (kind == "coclass") { t["guid"] = guid; t["implements"] = impls.ToArray(); }
        result.Add(t);
      }
    }
    return result;
  }
}
"@

  $hkcr = [Microsoft.Win32.Registry]::ClassesRoot
  $clsidRoot = $hkcr.OpenSubKey("CLSID")
  $servers = New-Object System.Collections.ArrayList
  foreach ($id in $clsidRoot.GetSubKeyNames()) {
    try {
      $k = $clsidRoot.OpenSubKey($id)
      if (-not $k) { continue }
      foreach ($kind in @("LocalServer32", "InprocServer32")) {
        $s = $k.OpenSubKey($kind)
        if (-not $s) { continue }
        $exe = Get-ExePath ([string]$s.GetValue(""))
        if (-not $exe -or ($exe -ine $target)) { continue }
        $prog = $null
        foreach ($pk in @("VersionIndependentProgID", "ProgID")) {
          $pkk = $k.OpenSubKey($pk)
          if ($pkk -and $pkk.GetValue("")) { $prog = [string]$pkk.GetValue(""); break }
        }
        $tlk = $k.OpenSubKey("TypeLib")
        $tlid = if ($tlk) { [string]$tlk.GetValue("") } else { $null }
        $srv = @{ clsid = $id; server = $(if ($kind -eq "LocalServer32") { "local" } else { "inproc" }); typeLibId = $tlid }
        if ($prog) { $srv.progId = $prog }
        [void]$servers.Add($srv)
      }
    } catch {}
  }

  $typeLibs = @{}
  $errors = New-Object System.Collections.ArrayList
  foreach ($srv in $servers) {
    $path = $null
    if ($srv.typeLibId) {
      $tk = $hkcr.OpenSubKey("TypeLib\" + $srv.typeLibId)
      if ($tk) {
        $vers = $tk.GetSubKeyNames() | Sort-Object { try { [double]$_ } catch { 0 } } -Descending
        foreach ($ver in $vers) {
          $vk = $tk.OpenSubKey($ver)
          foreach ($lc in $vk.GetSubKeyNames()) {
            if ($lc -notmatch '^[0-9a-fA-F]+$') { continue }
            foreach ($plat in @("win64", "win32")) {
              $pk = $vk.OpenSubKey("$lc\$plat")
              if ($pk -and $pk.GetValue("")) { $path = [Environment]::ExpandEnvironmentVariables([string]$pk.GetValue("")); break }
            }
            if ($path) { break }
          }
          if ($path) { break }
        }
      }
    }
    $fallback = $false
    if (-not $path) { $path = $target; $fallback = $true }
    if (-not $typeLibs.ContainsKey($path)) {
      try { $typeLibs[$path] = ([TLD]::Dump($path, $maxMembers)).ToArray() }
      catch {
        $typeLibs[$path] = @()
        # a target without an embedded type library is normal; report only registered ones that fail
        if (-not $fallback) { [void]$errors.Add("$path : $($_.Exception.Message)") }
      }
    }
    if ($typeLibs[$path].Count -gt 0) { $srv.typeLib = $path }
  }
  Save @{ servers = @($servers.ToArray()); typeLibs = $typeLibs; errors = @($errors.ToArray()) }
} catch {
  Save @{ error = $_.Exception.Message }
}

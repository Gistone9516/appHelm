# IF-31: full type library dump (types, params with types/optional/defaults, return types, enum values).
# ASCII only (IF-21). Input i.json: { file, maxMembers }. Output o.json written by C# (large libs: PS ConvertTo-Json is too slow).
$ErrorActionPreference = "Stop"
$inPath = Join-Path $PSScriptRoot "i.json"
$outPath = Join-Path $PSScriptRoot "o.json"
try {
  $p = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  Add-Type -TypeDefinition @"
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using CT = System.Runtime.InteropServices.ComTypes;
public static class TLF {
  [DllImport("oleaut32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void LoadTypeLibEx(string file, int regkind, out CT.ITypeLib lib);
  static readonly HashSet<string> Base = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
    "QueryInterface","AddRef","Release","GetTypeInfoCount","GetTypeInfo","GetIDsOfNames","Invoke" };
  static int total;

  static string Vt(int vt) {
    switch (vt) {
      case 2: return "Integer"; case 3: return "Long"; case 4: return "Single"; case 5: return "Double";
      case 6: return "Currency"; case 7: return "Date"; case 8: return "String"; case 9: return "Object";
      case 10: return "Error"; case 11: return "Boolean"; case 12: return "Variant"; case 13: return "Unknown";
      case 14: return "Decimal"; case 16: return "SByte"; case 17: return "Byte"; case 18: return "UInteger";
      case 19: return "ULong"; case 20: return "LongLong"; case 21: return "ULongLong"; case 22: return "Long";
      case 23: return "ULong"; case 24: return "void"; case 25: return "HRESULT"; case 30: return "String"; case 31: return "String";
      default: return "vt" + vt;
    }
  }
  static string TypeName(CT.ITypeInfo ti, CT.TYPEDESC td, int depth) {
    if (depth > 8) return "?";
    int vt = td.vt & 0x0FFF;
    if (vt == 26 || vt == 27) {
      var inner = (CT.TYPEDESC)Marshal.PtrToStructure(td.lpValue, typeof(CT.TYPEDESC));
      string n = TypeName(ti, inner, depth + 1);
      return vt == 27 ? n + "()" : n;
    }
    if (vt == 29) {
      try {
        CT.ITypeInfo rti; ti.GetRefTypeInfo(unchecked((int)td.lpValue.ToInt64()), out rti);
        string name, d, hf; int hc; rti.GetDocumentation(-1, out name, out d, out hc, out hf);
        return name;
      } catch { return "UserDefined"; }
    }
    return Vt(vt);
  }
  static object DefaultOf(CT.PARAMDESC pd) {
    try {
      if (pd.lpVarValue == IntPtr.Zero) return null;
      return Marshal.GetObjectForNativeVariant(IntPtr.Add(pd.lpVarValue, 8));
    } catch { return null; }
  }
  static string Kind(CT.TYPEKIND k) {
    switch (k) {
      case CT.TYPEKIND.TKIND_DISPATCH: return "dispatch"; case CT.TYPEKIND.TKIND_INTERFACE: return "interface";
      case CT.TYPEKIND.TKIND_COCLASS: return "coclass"; case CT.TYPEKIND.TKIND_ENUM: return "enum";
      case CT.TYPEKIND.TKIND_ALIAS: return "alias"; case CT.TYPEKIND.TKIND_MODULE: return "module";
      case CT.TYPEKIND.TKIND_RECORD: return "record"; default: return "other";
    }
  }

  public static void Dump(string file, int maxMembers, string outPath) {
    CT.ITypeLib lib; LoadTypeLibEx(file, 2, out lib);
    string lname, ldoc, lhf; int lhc; lib.GetDocumentation(-1, out lname, out ldoc, out lhc, out lhf);
    var types = new List<object>();
    total = 0;
    int n = lib.GetTypeInfoCount();
    int esz = Marshal.SizeOf(typeof(CT.ELEMDESC));
    for (int i = 0; i < n; i++) {
      CT.ITypeInfo ti; lib.GetTypeInfo(i, out ti);
      string name, doc, hf; int hc; ti.GetDocumentation(-1, out name, out doc, out hc, out hf);
      IntPtr pa; ti.GetTypeAttr(out pa);
      var ta = (CT.TYPEATTR)Marshal.PtrToStructure(pa, typeof(CT.TYPEATTR));
      string kind = Kind(ta.typekind);
      var t = new Dictionary<string, object>();
      t["name"] = name; t["kind"] = kind;
      if (!string.IsNullOrEmpty(doc)) t["doc"] = doc;
      if (((int)ta.wTypeFlags & (int)CT.TYPEFLAGS.TYPEFLAG_FHIDDEN) != 0) t["hidden"] = true;
      if (kind == "alias") t["aliasOf"] = TypeName(ti, ta.tdescAlias, 0);
      var members = new List<object>();
      for (int f = 0; f < ta.cFuncs && total < maxMembers; f++) {
        IntPtr pf; ti.GetFuncDesc(f, out pf);
        try {
          var fd = (CT.FUNCDESC)Marshal.PtrToStructure(pf, typeof(CT.FUNCDESC));
          int flags = (int)fd.wFuncFlags;
          if ((flags & (int)CT.FUNCFLAGS.FUNCFLAG_FRESTRICTED) != 0) continue;
          string[] names = new string[fd.cParams + 1]; int cn;
          ti.GetNames(fd.memid, names, names.Length, out cn);
          if (cn < 1 || Base.Contains(names[0])) continue;
          string mname, mdoc, mhf; int mhc; ti.GetDocumentation(fd.memid, out mname, out mdoc, out mhc, out mhf);
          var m = new Dictionary<string, object>();
          m["name"] = names[0];
          m["kind"] = fd.invkind == CT.INVOKEKIND.INVOKE_PROPERTYGET ? "get" : fd.invkind == CT.INVOKEKIND.INVOKE_PROPERTYPUT ? "put" : fd.invkind == CT.INVOKEKIND.INVOKE_PROPERTYPUTREF ? "putref" : "method";
          m["id"] = fd.memid;
          string ret = null;
          var ps = new List<object>();
          for (int k = 0; k < fd.cParams; k++) {
            var ed = (CT.ELEMDESC)Marshal.PtrToStructure(IntPtr.Add(fd.lprgelemdescParam, k * esz), typeof(CT.ELEMDESC));
            int pfl = (int)ed.desc.paramdesc.wParamFlags;
            string ptype = TypeName(ti, ed.tdesc, 0);
            if ((pfl & 8) != 0) { ret = ptype; continue; }
            if ((pfl & 4) != 0) continue;
            var pp = new Dictionary<string, object>();
            pp["name"] = (k + 1 < cn && names[k + 1] != null) ? names[k + 1] : ("p" + k);
            pp["type"] = ptype;
            bool opt = (pfl & 16) != 0 || (pfl & 32) != 0 || (fd.cParamsOpt > 0 && k >= fd.cParams - fd.cParamsOpt);
            if (opt) pp["opt"] = true;
            if ((pfl & 32) != 0) { var dv = DefaultOf(ed.desc.paramdesc); if (dv != null) pp["def"] = dv; }
            if ((pfl & 2) != 0 && (pfl & 1) == 0) pp["out"] = true;
            ps.Add(pp);
          }
          if (ret == null) { ret = TypeName(ti, fd.elemdescFunc.tdesc, 0); if (ret == "HRESULT") ret = "void"; }
          m["params"] = ps; m["returns"] = ret;
          if (!string.IsNullOrEmpty(mdoc)) m["doc"] = mdoc;
          if ((flags & (int)CT.FUNCFLAGS.FUNCFLAG_FHIDDEN) != 0) m["hidden"] = true;
          members.Add(m); total++;
        } finally { ti.ReleaseFuncDesc(pf); }
      }
      for (int v = 0; v < ta.cVars && total < maxMembers; v++) {
        IntPtr pv; ti.GetVarDesc(v, out pv);
        try {
          var vd = (CT.VARDESC)Marshal.PtrToStructure(pv, typeof(CT.VARDESC));
          string[] vn = new string[1]; int vc; ti.GetNames(vd.memid, vn, 1, out vc);
          if (vc < 1) continue;
          string vname, vdoc, vhf; int vhc; ti.GetDocumentation(vd.memid, out vname, out vdoc, out vhc, out vhf);
          var m = new Dictionary<string, object>();
          m["name"] = vn[0]; m["id"] = vd.memid;
          if (vd.varkind == CT.VARKIND.VAR_CONST) {
            m["kind"] = "const";
            try { m["value"] = Marshal.GetObjectForNativeVariant(vd.desc.lpvarValue); } catch {}
          } else {
            m["kind"] = "prop"; m["returns"] = TypeName(ti, vd.elemdescVar.tdesc, 0);
            if (((int)vd.wVarFlags & (int)CT.VARFLAGS.VARFLAG_FREADONLY) != 0) m["readonly"] = true;
          }
          if (!string.IsNullOrEmpty(vdoc)) m["doc"] = vdoc;
          members.Add(m); total++;
        } finally { ti.ReleaseVarDesc(pv); }
      }
      if (kind == "coclass") {
        var impls = new List<object>();
        for (int j = 0; j < ta.cImplTypes; j++) {
          try {
            int href; ti.GetRefTypeOfImplType(j, out href);
            CT.ITypeInfo rti; ti.GetRefTypeInfo(href, out rti);
            string iname, idoc, ihf; int ihc; rti.GetDocumentation(-1, out iname, out idoc, out ihc, out ihf);
            CT.IMPLTYPEFLAGS fl; ti.GetImplTypeFlags(j, out fl);
            var e = new Dictionary<string, object>(); e["name"] = iname;
            if (((int)fl & (int)CT.IMPLTYPEFLAGS.IMPLTYPEFLAG_FDEFAULT) != 0) e["default"] = true;
            if (((int)fl & (int)CT.IMPLTYPEFLAGS.IMPLTYPEFLAG_FSOURCE) != 0) e["events"] = true;
            impls.Add(e);
          } catch {}
        }
        t["implements"] = impls;
        t["guid"] = ta.guid.ToString("B").ToUpperInvariant();
      }
      ti.ReleaseTypeAttr(pa);
      t["members"] = members;
      types.Add(t);
    }
    var root = new Dictionary<string, object>();
    root["file"] = file; root["name"] = lname;
    if (!string.IsNullOrEmpty(ldoc)) root["doc"] = ldoc;
    root["memberCount"] = total; root["truncated"] = total >= maxMembers; root["types"] = types;
    var sb = new StringBuilder(1 << 20);
    Json(sb, root);
    File.WriteAllText(outPath, sb.ToString(), new UTF8Encoding(false));
  }

  static void Json(StringBuilder sb, object o) {
    if (o == null || o is DBNull || o == Type.Missing) { sb.Append("null"); return; }
    if (o is string) { Str(sb, (string)o); return; }
    if (o is bool) { sb.Append((bool)o ? "true" : "false"); return; }
    if (o is int || o is short || o is long || o is byte || o is uint || o is ushort || o is sbyte || o is ulong) { sb.Append(Convert.ToString(o, CultureInfo.InvariantCulture)); return; }
    if (o is double || o is float || o is decimal) {
      double d = Convert.ToDouble(o, CultureInfo.InvariantCulture);
      if (double.IsNaN(d) || double.IsInfinity(d)) sb.Append("null"); else sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
      return;
    }
    if (o is DateTime) { Str(sb, ((DateTime)o).ToString("o")); return; }
    var dict = o as IDictionary;
    if (dict != null) {
      sb.Append('{'); bool first = true;
      foreach (DictionaryEntry e in dict) { if (!first) sb.Append(','); first = false; Str(sb, e.Key.ToString()); sb.Append(':'); Json(sb, e.Value); }
      sb.Append('}'); return;
    }
    var list = o as IEnumerable;
    if (list != null) {
      sb.Append('['); bool first = true;
      foreach (var x in list) { if (!first) sb.Append(','); first = false; Json(sb, x); }
      sb.Append(']'); return;
    }
    Str(sb, o.ToString());
  }
  static void Str(StringBuilder sb, string s) {
    sb.Append('"');
    foreach (char c in s) {
      if (c == '"') sb.Append((char)92).Append('"');
      else if (c == (char)92) sb.Append((char)92).Append((char)92);
      else if (c < (char)32) sb.Append((char)92).Append('u').Append(((int)c).ToString("x4"));
      else sb.Append(c);
    }
    sb.Append('"');
  }
}
"@
  $max = if ($p.maxMembers) { [int]$p.maxMembers } else { 200000 }
  [TLF]::Dump([string]$p.file, $max, $outPath)
} catch {
  $msg = $_.Exception.Message
  while ($_.Exception.InnerException) { $msg = $_.Exception.InnerException.Message; break }
  [IO.File]::WriteAllText($outPath, (ConvertTo-Json @{ error = $msg } -Compress), (New-Object Text.UTF8Encoding $false))
}

# Build test fixtures with the C# compiler that ships with .NET Framework 4 (no install needed).
# ASCII only. Output goes to test\fixtures\build (git-ignored).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "test\fixtures\build"
New-Item -ItemType Directory -Force $out | Out-Null
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "csc.exe not found: $csc" }
& $csc /nologo /codepage:65001 /target:winexe "/out:$out\SampleApp.exe" /reference:System.Windows.Forms.dll (Join-Path $root "test\fixtures\dotnet-winforms\SampleApp.cs")
if ($LASTEXITCODE -ne 0) { throw "csc failed: $LASTEXITCODE" }
"built: $out\SampleApp.exe"

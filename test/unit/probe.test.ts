import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { findToolkits, resolveExecutable } from "../../src/probe/index.ts";

test("이름만 주면 PATH 앞쪽의 확장자 없는 파일보다 .exe를 먼저 고른다 (Git Bash usr\\bin)", () => {
  const root = mkdtempSync(join(tmpdir(), "apphelm-probe-"));
  const script = join(root, "a");
  const exe = join(root, "b");
  mkdirSync(script);
  mkdirSync(exe);
  writeFileSync(join(script, "zztool"), "#!/bin/sh\n");
  writeFileSync(join(exe, "zztool.exe"), "MZ");
  const saved = process.env.PATH;
  process.env.PATH = [script, exe].join(delimiter);
  try {
    assert.equal(resolveExecutable("zztool"), join(exe, "zztool.exe"));
  } finally {
    process.env.PATH = saved;
  }
});

// IF-35: 툴킷 판별

function appDir(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "apphelm-tk-"));
  for (const f of files) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), "x");
  }
  return root;
}

test("exe 폴더의 Qt6Core.dll로 Qt6(F1)를 고른다", () => {
  const root = appDir(["app.exe", "Qt6Core.dll"]);
  const t = findToolkits(join(root, "app.exe"), []);
  assert.deepEqual(t.map((x) => [x.id, x.code]), [["qt6", "F1"]]);
});

test("import로 확인한 툴킷이 폴더 표지보다 앞에 온다", () => {
  const root = appDir(["app.exe", "WebView2Loader.dll"]);
  const t = findToolkits(join(root, "app.exe"), ["KERNEL32.dll", "flutter_windows.dll"]);
  assert.deepEqual(t.map((x) => x.id), ["flutter", "webview2"]);
  assert.equal(t[0]!.evidence[0], "import flutter_windows.dll");
});

test("CEF는 하위 폴더(깊이 3) 안의 libcef.dll도 찾는다 (Steam bin\cef\cef.win64)", () => {
  const root = appDir(["steam.exe", join("bin", "cef", "cef.win64", "libcef.dll")]);
  const t = findToolkits(join(root, "steam.exe"), []);
  assert.equal(t[0]!.id, "cef");
  assert.ok(t[0]!.evidence[0]!.endsWith(join("bin", "cef", "cef.win64", "libcef.dll")), t[0]!.evidence[0]);
});

test("deep이 아닌 툴킷은 하위 폴더를 보지 않고, 깊이 3보다 깊은 CEF도 찾지 않는다", () => {
  const root = appDir(["app.exe", join("plugins", "Qt6Core.dll"), join("a", "b", "c", "d", "libcef.dll")]);
  assert.deepEqual(findToolkits(join(root, "app.exe"), []), []);
});

test("STRATEGY 6-5: --out에 풀리지 않은 %환경변수%가 남으면 그 이름을 돌려준다", async () => {
  const { unexpandedEnv } = await import("../../src/cli/libs.ts");
  assert.equal(unexpandedEnv("%TEMP%/apphelm-research/g1"), "TEMP");
  assert.equal(unexpandedEnv("C:/Users/me/AppData/Local/Temp/x"), undefined);
});

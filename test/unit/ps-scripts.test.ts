import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prepareJob } from "../../src/ps/runner.ts";

const SCRIPTS = join(import.meta.dirname, "..", "..", "src", "ps", "scripts");
const files = [...readdirSync(SCRIPTS).filter((n) => n.endsWith(".ps1")).map((n) => join(SCRIPTS, n)), join(SCRIPTS, "..", "com-core.ps1")];

test("IF-21: PowerShell 스크립트 원본은 ASCII만 쓴다", () => {
  const bad = files.filter((f) => readFileSync(f).some((b) => b > 0x7f));
  assert.deepEqual(bad, []);
});

test("F-34: 실행용 복사본은 BOM을 붙여 PowerShell 5.1이 UTF-8로 읽게 한다", () => {
  const job = prepareJob("uia.ps1", {}, mkdtempSync(join(tmpdir(), "apphelm-ps-")));
  const head = readFileSync(job.script).subarray(0, 3);
  assert.deepEqual([...head], [0xef, 0xbb, 0xbf]);
});

test("F-34: 모든 스크립트가 Windows PowerShell 5.1에서 문법 오류 없이 읽힌다", { skip: process.platform !== "win32" }, () => {
  const list = files.map((f) => `'${f.replace(/'/g, "''")}'`).join(",");
  const cmd = `$bad=@(); foreach($f in @(${list})){ $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($f,[ref]$null,[ref]$e); if($e.Count){ $bad+=(Split-Path $f -Leaf)+': '+$e[0].Message } }; $bad -join '|'`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "");
});

test("F-34: 실행기가 성공해도 스크립트가 ok:false를 돌려주면 실패로 보고한다", async () => {
  const { fromScript } = await import("../../src/invoke/index.ts");
  const lim = { code: "E_NOT_APPLICABLE" as const, collector: "invoke-uia", message: "no element matches the conditions" };
  assert.deepEqual(fromScript({ ok: true, data: { ok: false, limitation: lim } }, "uia"), { ok: false, limitation: lim });
  assert.equal(fromScript({ ok: true, data: { ok: true } }, "uia").ok, true);
});

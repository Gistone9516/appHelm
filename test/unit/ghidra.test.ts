import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectGhidra, ghidraEnv } from "../../src/rea-bridge/ghidra.ts";

function fakeInstall(): { ghidra: string; jdk: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "ghidra-fake-"));
  const ghidra = join(root, "ghidra");
  const jdk = join(root, "jdk");
  mkdirSync(join(ghidra, "support"), { recursive: true });
  mkdirSync(join(jdk, "bin"), { recursive: true });
  writeFileSync(join(ghidra, "support", "analyzeHeadless.bat"), "");
  writeFileSync(join(jdk, "bin", "java.exe"), "");
  return { ghidra, jdk, root };
}

test("detectGhidra: 환경 변수에서 찾기", () => {
  const f = fakeInstall();
  const cfg = detectGhidra({ GHIDRA_INSTALL_DIR: f.ghidra, JAVA_HOME: f.jdk } as NodeJS.ProcessEnv);
  assert.deepEqual(cfg, { ghidraDir: f.ghidra, javaHome: f.jdk });
});

test("detectGhidra: env가 설정되면 그 경로만 보고 폴백하지 않는다", () => {
  const f = fakeInstall();
  // 하나는 실제 fake, 다른 하나는 존재하지 않는 경로 → 폴백 없이 null
  assert.equal(detectGhidra({ GHIDRA_INSTALL_DIR: f.ghidra, JAVA_HOME: "C:\\nope-jdk" } as NodeJS.ProcessEnv), null);
  assert.equal(detectGhidra({ GHIDRA_INSTALL_DIR: "C:\\nope-ghidra", JAVA_HOME: f.jdk } as NodeJS.ProcessEnv), null);
  assert.equal(detectGhidra({ GHIDRA_INSTALL_DIR: "C:\\nope", JAVA_HOME: "C:\\nope" } as NodeJS.ProcessEnv), null);
});

test("ghidraEnv: REA에 넘길 변수 구성", () => {
  const env = ghidraEnv({ ghidraDir: "C:\\g", javaHome: "C:\\j" }, 123000);
  assert.equal(env.GHIDRA_INSTALL_DIR, "C:\\g");
  assert.equal(env.JAVA_HOME, "C:\\j");
  assert.equal(env.REA_ANALYSIS_PROVIDER, "ghidra");
  assert.equal(env.REA_GHIDRA_STARTUP_TIMEOUT_MS, "123000");
  assert.match(env.PATH ?? "", /C:\\j\\bin/);
});

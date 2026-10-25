import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { resolveExecutable } from "../../src/probe/index.ts";

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

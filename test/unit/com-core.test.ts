import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { COM_CORE_TARGETS, coreText, inline } from "../../scripts/build-ps.ts";
import { invoke, type ComStepResult } from "../../src/invoke/index.ts";

const skip = process.platform !== "win32";
const workDir = join(tmpdir(), "apphelm-test");
mkdirSync(workDir, { recursive: true });
const ctx = { workDir, timeoutMs: 60000 };

async function steps(progId: string, s: unknown[], extra: Record<string, unknown> = {}) {
  const r = await invoke({ kind: "com", progId, steps: s as never, ...extra }, ctx);
  return r;
}
const results = (r: Awaited<ReturnType<typeof steps>>) => (r.ok ? (r.detail.steps as ComStepResult[]) : []);

test("IF-29: 에이전트와 invoke-com.ps1의 com-core 구간이 원본과 같다", () => {
  const core = coreText();
  for (const f of COM_CORE_TARGETS) assert.equal(inline(f, core), readFileSync(join(import.meta.dirname, "../..", f), "utf8"), `${f}: npm run build:ps 필요`);
});

test("IF-26/27: 따옴표 안의 점, 번호 인자, 속성 설정, 배열 결과", { skip }, async () => {
  const r = await steps("Scripting.Dictionary", [
    { path: "Add", args: ["b.c", "x"] },
    { path: "Add", args: ["k", 1] },
    { path: 'Item("b.c")' },
    { path: "Item('k')", setValue: 5 },
    { path: "Item('k')" },
    { path: "Keys" },
  ]);
  assert.ok(r.ok, JSON.stringify(r));
  const s = results(r);
  assert.equal(s[2]!.result, "x");
  assert.equal(s[4]!.result, 5);
  assert.deepEqual(s[5]!.result, ["b.c", "k"]);
});

test("IF-27/28: 저장한 객체에서 이어 가기와 컬렉션 훑기", { skip }, async () => {
  const r = await steps("Shell.Application", [
    { path: "NameSpace(36)", save: "win" },
    { path: "$win.Items().Count" },
    { path: "$win.Items()", each: { props: ["Name", "IsFolder", "NoSuch"], max: 2 } },
  ]);
  assert.ok(r.ok, JSON.stringify(r));
  const s = results(r);
  assert.deepEqual(s[0]!.result, { object: "Folder3" });
  assert.ok((s[1]!.result as number) > 2);
  const each = s[2]!.result as { count: number; truncated: boolean; rows: Record<string, unknown>[] };
  assert.equal(each.rows.length, 2);
  assert.equal(each.truncated, true);
  assert.equal(typeof each.rows[0]!.Name, "string");
  assert.match(String(each.rows[0]!.NoSuch), /^!/);
});

test("IF-27: 첫 실패에서 멈추고 몇 번째 단계인지 알려 준다", { skip }, async () => {
  const r = await steps("Scripting.FileSystemObject", [{ path: "Drives.Count" }, { path: "NoSuch" }, { path: "Drives.Count" }]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.limitation.message, /단계 1 \(NoSuch\).*앞 단계 1개 성공/);
});

test("IF-27: 예전 단일 path 요청도 같은 길로 실행된다", { skip }, async () => {
  const r = await invoke({ kind: "com", progId: "Scripting.FileSystemObject", path: "Drives.Count" }, ctx);
  assert.ok(r.ok);
  if (r.ok) assert.ok(((r.detail.steps as ComStepResult[])[0]!.result as number) >= 1);
});

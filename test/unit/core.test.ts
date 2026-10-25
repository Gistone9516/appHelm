import assert from "node:assert/strict";
import { test } from "node:test";
import { mapProgram } from "../../src/core/pipeline.ts";
import { denyReason } from "../../src/core/policy.ts";
import type { Collector, CollectorContext, Target } from "../../src/core/types.ts";
import { merge } from "../../src/merge/index.ts";
import { buildCommandLine, reaErrorOf } from "../../src/rea-bridge/runner.ts";

const target: Target = { input: "x", kind: "file", path: "C:\\x.exe", family: "native", familyEvidence: [], muiPaths: [] };
const ctx: CollectorContext = {
  allow: { live: false, launch: false },
  timeoutMs: 1000,
  workDir: ".",
  lang: "ko-KR",
  rea: { run: async () => ({ ok: false, limitation: { code: "E_REA_UNAVAILABLE", collector: "rea-bridge", message: "없음" } }) },
  log: () => {},
};
const collector = (id: string, sideEffect: Collector["sideEffect"], collect: Collector["collect"]): Collector => ({ id, sideEffect, appliesTo: () => true, collect });

test("IF-2: 실행·부착 수집은 허용 플래그가 있어야 한다", () => {
  assert.equal(denyReason(collector("a", "none", async () => ({ evidence: [], limitations: [] })), ctx.allow), null);
  assert.equal(denyReason(collector("b", "launches-target", async () => ({ evidence: [], limitations: [] })), ctx.allow)?.code, "E_OPT_IN_REQUIRED");
  assert.equal(denyReason(collector("c", "attaches-running", async () => ({ evidence: [], limitations: [] })), { live: true, launch: false }), null);
});

test("IF-1: 수집원 하나가 실패해도 나머지 결과는 남는다", async () => {
  const ok = collector("ok", "none", async () => ({
    evidence: [{ id: "1", source: "ok", kind: "import-capability", payload: { capability: "클립보드" }, confidence: 0.4, locator: { file: "x" } }],
    limitations: [],
  }));
  const bad = collector("bad", "none", async () => {
    throw new Error("터짐");
  });
  const launch = collector("launch", "launches-target", async () => ({ evidence: [], limitations: [] }));
  const doc = await mapProgram("x", ctx, { probe: async () => ({ target, limitations: [] }), collectors: [bad, ok, launch], merge });
  assert.ok(!("error" in doc));
  if ("error" in doc) return;
  assert.deepEqual(doc.capabilities, ["클립보드"]);
  assert.deepEqual(doc.limitations.map((l) => `${l.collector}:${l.code}`).sort(), ["bad:E_PARSE", "launch:E_OPT_IN_REQUIRED"]);
});

test("IF-12: REA 명령줄은 버전을 고정하고 인자를 따옴표로 감싼다", () => {
  assert.equal(
    buildCommandLine("inspect-pe-resources", ["C:\\Program Files\\a b\\x.exe"]),
    '"npx -y rea-agents@6.7.0 inspect-pe-resources "C:\\Program Files\\a b\\x.exe" --json"',
  );
  assert.throws(() => buildCommandLine("x", ['a"b']));
});

test("REA 오류 보고 판정", () => {
  assert.match(reaErrorOf({ code: "COMMAND_NOT_FOUND", message: "없음" }) ?? "", /COMMAND_NOT_FOUND/);
  assert.equal(reaErrorOf({ normalized_result: {}, code: 1, message: "x" }), null);
});

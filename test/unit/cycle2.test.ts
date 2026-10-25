import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeInterfaces, toServerDocs } from "../../src/collectors/com-typelib/index.ts";
import { splitTemplate } from "../../src/collectors/registry-verbs/index.ts";
import { mapProgram } from "../../src/core/pipeline.ts";
import type { Collector, CollectorContext, Evidence, Target } from "../../src/core/types.ts";
import { merge, normalizeLabel } from "../../src/merge/index.ts";
import { asArray } from "../../src/ps/runner.ts";
import { MAX_MD_BYTES, defaultInterface, renderMarkdown } from "../../src/render/markdown.ts";
import { needsScheduledTask } from "../../src/session/index.ts";

const target: Target = { input: "x", kind: "file", path: "C:\\x\\app.exe", family: "native", familyEvidence: [], muiPaths: [] };
const ev = (kind: Evidence["kind"], payload: Record<string, unknown>, extra: Partial<Evidence> = {}): Evidence => ({
  id: `${kind}:${JSON.stringify(payload)}`,
  source: "test",
  kind,
  payload,
  confidence: 0.8,
  locator: { file: "x" },
  ...extra,
});

test("IF-18: 명령 템플릿 분리, 자리표시자는 그대로", () => {
  assert.deepEqual(splitTemplate('"C:\\Program Files\\a b\\x.exe" -w "%l" %*'), ["C:\\Program Files\\a b\\x.exe", "-w", "%l", "%*"]);
  assert.deepEqual(splitTemplate("C:\\WINDOWS\\System32\\NOTEPAD.EXE /p %1"), ["C:\\WINDOWS\\System32\\NOTEPAD.EXE", "/p", "%1"]);
});

test("F-11: asArray는 PowerShell의 풀린 배열을 되돌린다", () => {
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(".txt"), [".txt"]);
  assert.deepEqual(asArray([1, 2]), [1, 2]);
});

test("IF-17/F-12: 숨김 인터페이스는 coclass가 가리킬 때만 남는다", () => {
  const list = normalizeInterfaces([
    { name: "InternetExplorer", kind: "coclass", guid: "{0002DF01-0000-0000-C000-000000000046}", implements: ["IWebBrowser2"], members: [], hidden: false },
    { name: "IWebBrowser2", kind: "dispatch", members: [{ name: "Navigate", invokeKind: "method", params: "URL" }], hidden: true },
    { name: "ISecret", kind: "dispatch", members: [{ name: "X", invokeKind: "method", params: [] }], hidden: true },
  ]);
  assert.deepEqual(list.map((i) => i.name), ["InternetExplorer", "IWebBrowser2"]);
  assert.deepEqual(list[1]!.members[0]!.params, ["URL"]);
  assert.ok(!("hidden" in list[1]!));
});

test("IF-17: 같은 TypeLib의 인터페이스는 첫 서버에만", () => {
  const docs = toServerDocs({
    servers: [
      { clsid: "{A}", progId: "App.One", server: "local", typeLib: "t.tlb" },
      { clsid: "{B}", server: "local", typeLib: "t.tlb" },
    ],
    typeLibs: { "t.tlb": [{ name: "IApp", kind: "dispatch", members: [{ name: "Run", invokeKind: "method", params: [] }] }] },
    errors: [],
  });
  assert.equal(docs[0]!.interfaces.length, 1);
  assert.equal(docs[1]!.interfaces.length, 0);
});

test("IF-14: 세션 판별", () => {
  assert.equal(needsScheduledTask({}), true);
  assert.equal(needsScheduledTask({ SESSIONNAME: "Console" }), false);
  assert.equal(needsScheduledTask({ SESSIONNAME: "Console", REA_ADAPTER_SESSION: "task" }), true);
  assert.equal(needsScheduledTask({ REA_ADAPTER_SESSION: "direct" }), false);
});

test("IF-18: 같은 템플릿의 셸 동사는 하나로 묶인다", () => {
  const verb = (progId: string, ext: string[], v: string, template: string) =>
    ev("shell-verb", { progId, verb: v, template, extensions: ext, argv: splitTemplate(template) }, { invoke: [{ via: "cli", argv: splitTemplate(template) }] });
  const doc = merge(
    target,
    [verb("txtfile", [".txt"], "open", "NOTEPAD.EXE %1"), verb("batfile", [".bat"], "edit", "notepad.exe %1"), verb("txtfile", [".txt"], "print", "NOTEPAD.EXE /p %1")],
    [],
    { collectorsRun: [] },
  );
  assert.equal(doc.automation.cli.length, 2);
  assert.match(doc.automation.cli[0]!.source, /open\/edit: \.txt, \.bat/);
  // JSON 쪽 출처 목록은 줄이지 않는다
  const many = merge(
    target,
    Array.from({ length: 8 }, (_, i) => verb(`p${i}`, [`.e${i}`], "open", "x.exe %1")),
    [],
    { collectorsRun: [] },
  );
  assert.match(many.automation.cli[0]!.source, /\.e7/);
  assert.equal(doc.operations.filter((o) => o.group === "셸 동사").length, 2);
});

test("IF-20: UI 요소 이름이 작업 제목과 같으면 uia 힌트", () => {
  assert.equal(normalizeLabel("파일(&F)"), "파일");
  assert.equal(normalizeLabel("열기...\tCtrl+O"), "열기");
  const doc = merge(
    target,
    [
      ev("menu-item", { menuName: 1, path: ["파일", "열기..."], text: "열기...", commandId: 2 }),
      ev("ui-element", { windows: ["제목 없음"], truncated: false, elements: [{ path: "w > 열기", controlType: "Button", name: "열기", automationId: "open", patterns: ["Invoke"] }] }),
    ],
    [],
    { collectorsRun: [] },
  );
  const op = doc.operations.find((o) => o.title === "열기...")!;
  assert.ok(op.invoke.some((h) => h.via === "uia" && h.automationId === "open"));
  assert.equal(doc.summary.counts.uiElements, 1);
});

test("IF-17/IF-13: COM 요약은 기본 인터페이스에서 예시를 뽑고 4KB를 넘지 않는다", () => {
  const members = Array.from({ length: 300 }, (_, i) => ({ name: `Member${i}`, invokeKind: "method" as const, params: [] }));
  const com = {
    clsid: "{0002DF01-0000-0000-C000-000000000046}",
    progId: "InternetExplorer.Application",
    server: "local",
    interfaces: [
      { name: "InternetExplorer", kind: "coclass", guid: "{0002df01-0000-0000-c000-000000000046}", implements: ["IWebBrowser2"], members: [] },
      { name: "IHelper", kind: "dispatch", members },
      { name: "IWebBrowser2", kind: "dispatch", members: [{ name: "Navigate", invokeKind: "method", params: ["URL"] }] },
    ],
  };
  const doc = merge(target, [ev("com-server", com)], [], { collectorsRun: [] });
  assert.equal(defaultInterface(doc.automation.com[0]!)?.name, "IWebBrowser2");
  assert.deepEqual(doc.summary.howToOperate, ["com"]);
  const md = renderMarkdown(doc, "x.json");
  assert.match(md, /기본 인터페이스 IWebBrowser2: Navigate/);
  assert.match(md, /New-Object -ComObject InternetExplorer\.Application/);
  assert.ok(Buffer.byteLength(md, "utf8") <= MAX_MD_BYTES);
});

test("수집원은 동시에 돌지만 결과 순서는 목록 순서", async () => {
  const ctx = { allow: { live: false, launch: false }, timeoutMs: 1000, workDir: ".", lang: "ko-KR", rea: { run: async () => ({ ok: true as const, json: {} }) }, log: () => {} } as CollectorContext;
  const slow: Collector = {
    id: "slow",
    sideEffect: "none",
    appliesTo: () => true,
    collect: async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { evidence: [ev("import-capability", { capability: "먼저" })], limitations: [] };
    },
  };
  const fast: Collector = { id: "fast", sideEffect: "none", appliesTo: () => true, collect: async () => ({ evidence: [ev("import-capability", { capability: "나중" })], limitations: [] }) };
  const doc = await mapProgram("x", ctx, { probe: async () => ({ target, limitations: [] }), collectors: [slow, fast], merge });
  assert.ok(!("error" in doc));
  if ("error" in doc) return;
  assert.deepEqual(doc.capabilities, ["먼저", "나중"]);
});

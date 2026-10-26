import assert from "node:assert/strict";
import { test } from "node:test";
import type { Evidence, Target } from "../../src/core/types.ts";
import { contextualTables, merge, sortInvoke } from "../../src/merge/index.ts";
import { titleFromString } from "../../src/merge/knownIds.ts";
import { MAX_MD_BYTES, renderMarkdown } from "../../src/render/markdown.ts";

const target: Target = { input: "x", kind: "file", path: "C:\\x\\app.exe", family: "native", familyEvidence: [], muiPaths: [] };
const ev = (kind: Evidence["kind"], payload: Record<string, unknown>): Evidence => ({
  id: `${kind}:${JSON.stringify(payload)}`,
  source: "pe-resources",
  kind,
  payload,
  confidence: 0.9,
  locator: { file: "x" },
});
const accel = (table: string, keys: string, commandId: number) => ev("accelerator", { table, keys, commandId });

test("IF-15: 다른 표와 어긋나는 표는 상황별 표", () => {
  const a = [
    { table: "MAIN", keys: "Ctrl+C", commandId: 769 },
    { table: "SLIP", keys: "Ctrl+C", commandId: 769 },
    { table: "SLIP", keys: "Ctrl+C", commandId: 7 },
    { table: "GLOBAL", keys: "Ctrl+W", commandId: 7 },
  ];
  assert.deepEqual([...contextualTables(a)], ["SLIP"]);
});

test("IF-15: 상황별 표에만 있는 단축키는 context가 붙고 요약에서 빠진다", () => {
  const doc = merge(
    target,
    [
      ev("menu-item", { menuName: 1, path: ["파일", "끝내기"], text: "끝내기", commandId: 7 }),
      accel("GLOBAL", "Ctrl+W", 7),
      accel("MAIN", "Ctrl+C", 769),
      accel("SLIP", "Ctrl+C", 769),
      accel("SLIP", "Ctrl+C", 7),
      accel("SLIP", "Esc", 7),
    ],
    [],
    { collectorsRun: [] },
  );
  const exit = doc.operations.find((o) => o.title === "끝내기")!;
  const shortcuts = exit.invoke.filter((h) => h.via === "shortcut");
  assert.deepEqual(shortcuts, [
    { via: "shortcut", keys: "Ctrl+W" },
    { via: "shortcut", keys: "Ctrl+C", context: "SLIP" },
    { via: "shortcut", keys: "Esc", context: "SLIP" },
  ]);
  const md = renderMarkdown(doc, "x.json");
  assert.match(md, /\| 파일 \| 끝내기 \| Ctrl\+W \| 7 \|/);
});

test("IF-10: 메뉴와 단축키가 commandId로 합쳐지고 표가 우선", () => {
  const doc = merge(
    target,
    [ev("menu-item", { menuName: 1, path: ["파일", "저장"], text: "저장", shortcutText: "Ctrl+Alt+S", commandId: 3 }), accel("A", "Ctrl+S", 3)],
    [],
    { collectorsRun: [] },
  );
  assert.equal(doc.operations.length, 1);
  assert.deepEqual(doc.operations[0]!.invoke, [
    { via: "wm_command", id: 3 },
    { via: "shortcut", keys: "Ctrl+S" },
    { via: "menu", path: ["파일", "저장"], commandId: 3 },
  ]);
});

test("메뉴 리소스가 여럿이면 주 메뉴가 최상위, 팝업 메뉴는 뒤에", () => {
  const doc = merge(
    target,
    [
      ev("menu-item", { menuName: 101, path: ["팝업 메뉴 101", "수정"], text: "수정", commandId: 912 }),
      ev("menu-item", { menuName: 100, path: ["파일", "끝내기"], text: "끝내기", commandId: 661 }),
      ev("menu-item", { menuName: 100, path: ["즐겨찾기", "추가"], text: "추가", commandId: 1281 }),
    ],
    [],
    { collectorsRun: [] },
  );
  assert.deepEqual(doc.ui.menus.map((m) => m.text), ["파일", "즐겨찾기", "팝업 메뉴 101"]);
});

test("IF-9: 호출 방법 정렬 순서", () => {
  const s = sortInvoke([
    { via: "menu", path: ["a"] },
    { via: "shortcut", keys: "F1" },
    { via: "com", progId: "x", member: "y" },
    { via: "wm_command", id: 1 },
  ]);
  assert.deepEqual(s.map((h) => h.via), ["com", "wm_command", "shortcut", "menu"]);
});

test("IF-16: 단축키 전용 명령의 이름 출처 순서", () => {
  const doc = merge(
    target,
    [accel("A", "Ctrl+B", 50002), ev("string", { stringId: 50002, text: "텍스트를 굵게 합니다.\n굵게" }), accel("A", "Ctrl+S", 57603), accel("A", "F9", 12345)],
    [],
    { collectorsRun: [] },
  );
  const byId = (id: number) => doc.operations.find((o) => o.invoke.some((h) => h.via === "wm_command" && h.id === id))!;
  assert.equal(byId(50002).title, "굵게");
  assert.equal(byId(57603).title, "저장");
  assert.equal(byId(57603).confidence, 0.6);
  assert.equal(byId(12345).title, "명령 #12345");
  assert.equal(titleFromString("한 줄"), "한 줄");
});

test("IF-13: Markdown 요약은 4KB 이하", () => {
  const evidence: Evidence[] = [];
  for (let i = 0; i < 500; i++) evidence.push(ev("menu-item", { menuName: 1, path: ["아주 긴 메뉴 이름", `작업 이름 ${i} 입니다`], text: `작업 이름 ${i} 입니다`, commandId: i + 1 }));
  const md = renderMarkdown(merge(target, evidence, [], { collectorsRun: [] }), "C:\\out\\app.ops.json");
  assert.ok(Buffer.byteLength(md, "utf8") <= MAX_MD_BYTES, `크기 ${Buffer.byteLength(md, "utf8")}`);
  assert.match(md, /500개 중 \d+개 표시/);
});

test("IF-35: 툴킷마다 근거와 먼저 쓸 창구, 켜는 법을 적고 4KB를 지킨다", () => {
  const withTk: Target = { ...target, toolkits: [{ id: "cef", code: "E2", name: "CEF", evidence: ["하위 폴더에 bin\\cef\\cef.win64\\libcef.dll"] }] };
  const evidence: Evidence[] = [];
  for (let i = 0; i < 500; i++) evidence.push(ev("menu-item", { menuName: 1, path: ["메뉴", `작업 ${i}`], text: `작업 ${i}`, commandId: i + 1 }));
  const md = renderMarkdown(merge(withTk, evidence, [], { collectorsRun: [] }), "C:\out\app.ops.json");
  assert.ok(md.includes("- 툴킷: CEF (E2), 근거 하위 폴더에 bin"), md);
  assert.match(md, /먼저 쓸 창구: CDP.*켜는 법: `--remote-debugging-port/);
  assert.ok(Buffer.byteLength(md, "utf8") <= MAX_MD_BYTES);
});

// 실제 Windows 기본 앱으로 확인한다. REA 다운로드가 필요할 수 있어 첫 실행은 1~2분 걸린다.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { OperationDoc } from "../../src/core/types.ts";
import { parsePe, readImports } from "../../src/pe/pe.ts";

const skip = process.platform !== "win32";
const out = mkdtempSync(join(tmpdir(), "apphelm-e2e-"));

function mapApp(target: string, stem: string, extra: string[] = []): { md: string; doc: OperationDoc } {
  const r = spawnSync(process.execPath, ["bin/apphelm.mjs", "map", target, "--out", out, "--quiet", ...extra], { encoding: "utf8", timeout: 300000 });
  assert.equal(r.status, 0, r.stderr);
  return { md: r.stdout, doc: JSON.parse(readFileSync(join(out, `${stem}.ops.json`), "utf8")) as OperationDoc };
}

const shortcutsOf = (doc: OperationDoc, title: string) =>
  doc.operations.find((o) => o.title === title)?.invoke.filter((h) => h.via === "shortcut" && !h.context).map((h) => (h as { keys: string }).keys) ?? [];

test("notepad: 메뉴, 단축키, 버전, 기능", { skip }, () => {
  const { md, doc } = mapApp("notepad", "notepad");
  const tops = doc.ui.menus.map((m) => m.text);
  assert.ok(["파일", "편집", "서식", "보기", "도움말"].every((t) => tops.includes(t)) || ["File", "Edit", "Format", "View", "Help"].every((t) => tops.includes(t)), tops.join(","));
  const save = doc.operations.find((o) => o.title === "저장" || o.title === "Save")!;
  assert.ok(save.invoke.some((h) => h.via === "wm_command"));
  assert.deepEqual(shortcutsOf(doc, save.title), ["Ctrl+S"]);
  const allKeys = doc.operations.flatMap((o) => o.invoke).filter((h) => h.via === "shortcut").map((h) => (h as { keys: string }).keys);
  for (const k of ["Ctrl+F", "Ctrl+H", "F5", "Ctrl+G"]) assert.ok(allKeys.includes(k), k);
  assert.ok(doc.summary.fileDescription);
  for (const c of ["클립보드", "파일 열기·저장 대화상자", "인쇄"]) assert.ok(doc.capabilities.includes(c), c);
  // IF-15: 끝내기에 상황별 표(SLIPUPACC)의 Ctrl+C가 기본 단축키로 붙지 않는다
  const exit = doc.operations.find((o) => o.title === "끝내기" || o.title === "Exit")!;
  assert.ok(!shortcutsOf(doc, exit.title).includes("Ctrl+C"));
  assert.ok(Buffer.byteLength(md, "utf8") <= 4096);
});

test("regedit: 즐겨찾기 메뉴와 F3", { skip }, () => {
  const { doc } = mapApp("C:\\Windows\\regedit.exe", "regedit");
  assert.ok(doc.ui.menus.some((m) => m.text === "즐겨찾기" || m.text === "Favorites"));
  assert.ok(doc.operations.some((o) => o.invoke.some((h) => h.via === "shortcut" && h.keys === "F3")));
  assert.ok(doc.ui.dialogs.length > 0);
});

test("mspaint: MFC 표준 ID 이름과 상황별 표 처리", { skip }, () => {
  const { doc } = mapApp("mspaint", "mspaint");
  const save = doc.operations.find((o) => o.invoke.some((h) => h.via === "wm_command" && h.id === 57603));
  assert.ok(save && save.title !== "명령 #57603", save?.title);
});

test("IF-6/F-3 교차 확인: REA가 준 메뉴 리소스 수만큼 메뉴가 해석된다", { skip }, () => {
  const { doc } = mapApp("notepad", "notepad");
  const run = doc.provenance.collectorsRun.find((c) => c.id === "pe-resources");
  assert.ok(run && run.evidence > 0);
  assert.ok(!doc.limitations.some((l) => l.code === "E_PARSE"), JSON.stringify(doc.limitations));
});

test("IF-18: notepad 연결 프로그램 명령줄 (.txt, /p 인쇄)", { skip }, () => {
  const { doc } = mapApp("notepad", "notepad");
  assert.ok(doc.automation.cli.some((c) => c.source.includes(".txt")), JSON.stringify(doc.automation.cli.map((c) => c.source)));
  assert.ok(doc.automation.cli.some((c) => /\/p %1/i.test(c.template)));
});

const ie = "C:\\Program Files\\Internet Explorer\\iexplore.exe";
test("IF-17: iexplore COM 서버와 기본 인터페이스", { skip: skip || !existsSync(ie) }, () => {
  const { md, doc } = mapApp(ie, "iexplore");
  const server = doc.automation.com.find((c) => c.progId === "InternetExplorer.Application");
  assert.ok(server, JSON.stringify(doc.automation.com.map((c) => c.progId)));
  const wb2 = server.interfaces.find((i) => i.name === "IWebBrowser2");
  assert.ok(wb2?.members.some((m) => m.name === "Navigate"));
  assert.ok(!wb2?.members.some((m) => m.name === "QueryInterface"));
  assert.match(md, /기본 인터페이스 IWebBrowser2/);
  assert.equal(doc.summary.howToOperate[0], "com");
});

test("IF-20/IF-14: 실행 중인 explorer의 화면 요소 (--live, 사용자 세션)", { skip }, () => {
  const { doc } = mapApp("C:\\Windows\\explorer.exe", "explorer", ["--live"]);
  assert.ok(doc.ui.live && doc.ui.live.elements.length > 0, JSON.stringify(doc.limitations));
});

const sample = "test\\fixtures\\build\\SampleApp.exe";
test("IF-22: 빌드한 WinForms 앱의 폼과 처리기 (.NET)", { skip: skip || !existsSync(sample) }, () => {
  const { doc } = mapApp(sample, "SampleApp");
  assert.equal(doc.target.family, "dotnet");
  const form = doc.ui.forms.find((f) => f.className === "ReaAdapterFixture.MainForm");
  assert.ok(form, JSON.stringify(doc.ui.forms.map((f) => f.className)));
  const btn = form.controls.find((c) => c.name === "btnRun");
  assert.ok(btn?.handlers.some((h) => h.method === "btnRun_Click"));
});

const gitUnins = "C:\\Program Files\\Git\\unins000.exe";
test("IF-23: Delphi 폼 해석 (Git 설치 제거기)", { skip: skip || !existsSync(gitUnins) }, () => {
  const { doc } = mapApp(gitUnins, "unins000");
  assert.equal(doc.target.family, "delphi");
  const wizard = doc.ui.forms.find((f) => f.className === "TWizardForm");
  assert.ok(wizard, JSON.stringify(doc.ui.forms.map((f) => f.className)));
  assert.ok(wizard.controls.some((c) => c.name === "FNextButton" && c.handlers.some((h) => h.method === "NextButtonClick")));
});

test("IF-8: PE import 표 읽기 (notepad.exe)", { skip }, () => {
  const imports = readImports(parsePe(new Uint8Array(readFileSync("C:\\Windows\\System32\\notepad.exe"))));
  assert.ok(imports.length > 5);
  assert.ok(imports.some((d) => d.functions.includes("GetOpenFileNameW") || d.functions.includes("GetSaveFileNameW")));
});

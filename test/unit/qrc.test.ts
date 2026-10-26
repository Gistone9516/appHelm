import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import type { FormDoc } from "../../src/core/types.ts";
import { readQml } from "../../src/decoders/qml.ts";
import { readQrc } from "../../src/decoders/qrc.ts";
import { withQmlType } from "../../src/merge/index.ts";

/** 이름 표, 구조 표(22바이트 항목), 데이터 표를 rcc가 만드는 모양 그대로 이어 붙인다 */
function buildRcc(files: { dir: string; name: string; text: string; zlib?: boolean }[]): Uint8Array {
  const out: number[] = [];
  const be16 = (v: number) => out.push((v >> 8) & 0xff, v & 0xff);
  const be32 = (v: number) => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  const pad = (n: number) => { for (let i = 0; i < n; i++) out.push(0); };
  pad(64); // 앞쪽 다른 데이터
  // 데이터 표
  const dataBase = out.length;
  const dataOff: number[] = [];
  for (const f of files) {
    dataOff.push(out.length - dataBase);
    const raw = Buffer.from(f.text, "utf8");
    if (f.zlib) {
      const z = deflateSync(raw);
      be32(z.length + 4);
      be32(raw.length);
      out.push(...z);
    } else {
      be32(raw.length);
      out.push(...raw);
    }
  }
  // 이름 표
  const namesBase = out.length;
  const nameOff = new Map<string, number>();
  for (const n of [...new Set(files.flatMap((f) => [f.dir, f.name]))]) {
    nameOff.set(n, out.length - namesBase);
    be16(n.length);
    be32(0x1234);
    for (const ch of n) be16(ch.charCodeAt(0));
  }
  // 구조 표: 0 뿌리, 1 폴더, 2.. 파일 (모든 파일이 같은 폴더)
  const entry = (name: number, flags: number, a: number, b: number) => { be32(name); be16(flags); be32(a); be32(b); pad(8); };
  entry(0, 2, 1, 1);
  entry(nameOff.get(files[0]!.dir)!, 2, files.length, 2);
  files.forEach((f, i) => entry(nameOff.get(f.name)!, f.zlib ? 1 : 0, 0, dataOff[i]!));
  pad(64);
  return new Uint8Array(out);
}

const PAGE = `import QtQuick
Item {
    Shortcut {
        sequence: StandardKey.New
        onActivated: dlg.newDownload()
    }
    Shortcut { sequences: ["Ctrl+Shift+D", StandardKey.Quit]; onActivated: { // 주석
        tools.doIt(); } }
    Text { text: qsTr("Add download") + App.loc.emptyString }
    Text { text: qsTr("Add download") }
}
`;

test("IF-36: 심볼 없이 Qt 리소스 표를 찾아 평문과 zlib QML을 꺼낸다", () => {
  const bytes = buildRcc([
    { dir: "ui", name: "Page.qml", text: PAGE },
    { dir: "ui", name: "Dialog.qml", text: 'import QtQuick\nItem { Text { text: qsTr("OK") } }\n', zlib: true },
  ]);
  const r = readQrc(bytes);
  assert.equal(r.trees, 1);
  assert.deepEqual(r.files.map((f) => [f.path, f.compression]).sort(), [["/ui/Dialog.qml", "zlib"], ["/ui/Page.qml", "none"]]);
  const dlg = r.files.find((f) => f.path === "/ui/Dialog.qml")!;
  assert.match(new TextDecoder().decode(dlg.data!), /qsTr\("OK"\)/);
});

test("IF-36: Qt 리소스가 없으면 빈 결과", () => {
  const r = readQrc(new Uint8Array(4096));
  assert.equal(r.files.length, 0);
});

test("IF-36: Shortcut의 StandardKey는 Windows 키로, 키가 없는 Quit은 버리고, onActivated 블록은 첫 줄", () => {
  const info = readQml(PAGE);
  assert.deepEqual(info.shortcuts, [
    { keys: "Ctrl+N", handler: "dlg.newDownload()" },
    { keys: "Ctrl+Shift+D", handler: "tools.doIt()" },
  ]);
  assert.deepEqual(info.labels, ["Add download"]);
});

test("IF-36: AutomationId의 QMLTYPE 마디 중 QML 폼이 있는 가장 깊은 형식을 단다", () => {
  const forms: FormDoc[] = [
    { framework: "qml", className: "DownloadsPage", controls: [], source: "/a/DownloadsPage.qml" },
    { framework: "qml", className: "MainToolbar_V2", controls: [], source: "/a/MainToolbar_V2.qml" },
  ];
  const el = { path: "x", controlType: "CheckBox", name: "", patterns: [], automationId: "App.Win_QMLTYPE_1.DownloadsPage_QMLTYPE_104.MainToolbar_V2_QMLTYPE_142.CheckBox_V2_QMLTYPE_52" };
  assert.equal(withQmlType(el, forms).qmlType, "MainToolbar_V2");
  assert.equal(withQmlType({ ...el, automationId: "Plain" }, forms).qmlType, undefined);
});

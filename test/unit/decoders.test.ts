import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeAccelerators } from "../../src/decoders/accelerator.ts";
import { decodeDialog } from "../../src/decoders/dialog.ts";
import { decodeMenu } from "../../src/decoders/menu.ts";
import { splitMenuText } from "../../src/decoders/reader.ts";
import { decodeStringBlock } from "../../src/decoders/stringtable.ts";
import { decodeVersionInfo } from "../../src/decoders/versioninfo.ts";
import { Builder } from "./bytes.ts";

test("splitMenuText: 니모닉 제거와 단축키 분리", () => {
  assert.deepEqual(splitMenuText("저장(&S)\tCtrl+S"), { text: "저장", shortcut: "Ctrl+S" });
  assert.deepEqual(splitMenuText("&File"), { text: "File" });
  assert.deepEqual(splitMenuText("Save && Close"), { text: "Save & Close" });
});

test("menu: 일반 MENU 트리와 구분선", () => {
  const b = new Builder().u16(0).u16(0);
  b.u16(0x10 | 0x80).str("파일(&F)"); // 마지막 최상위 팝업
  b.u16(0).u16(3).str("저장(&S)\tCtrl+S");
  b.u16(0).u16(0).str(""); // 구분선
  b.u16(0x80).u16(7).str("끝내기(&X)");
  const tree = decodeMenu(b.bytes());
  assert.equal(tree.length, 1);
  assert.equal(tree[0]!.text, "파일");
  assert.deepEqual(tree[0]!.children, [
    { text: "저장", shortcutText: "Ctrl+S", commandId: 3 },
    { text: "", separator: true },
    { text: "끝내기", commandId: 7 },
  ]);
});

test("menu: MENUEX", () => {
  const b = new Builder().u16(1).u16(4).u32(0); // 버전 1, offset 4, helpId
  b.u32(0).u32(0).u32(0).u16(0x01 | 0x80).str("Edit").align4().u32(0); // 팝업, 마지막
  b.u32(0).u32(0).u32(769).u16(0).str("Copy\tCtrl+C").align4();
  b.u32(0x800).u32(0).u32(0).u16(0).str("").align4(); // 구분선
  b.u32(0).u32(0).u32(770).u16(0x80).str("Paste").align4();
  const tree = decodeMenu(b.bytes());
  assert.equal(tree[0]!.text, "Edit");
  assert.deepEqual(tree[0]!.children, [
    { text: "Copy", shortcutText: "Ctrl+C", commandId: 769 },
    { text: "", separator: true },
    { text: "Paste", commandId: 770 },
  ]);
});

test("accelerator: 가상 키, 수식키, 마지막 항목", () => {
  const b = new Builder();
  b.u16(0x01 | 0x08).u16(0x53).u16(3).u16(0); // Ctrl+S
  b.u16(0x01 | 0x08 | 0x04).u16(0x4e).u16(8).u16(0); // Ctrl+Shift+N
  b.u16(0x01 | 0x80).u16(0x74).u16(26).u16(0); // F5, 마지막
  b.u16(0x01).u16(0x41).u16(99).u16(0); // 마지막 뒤라 읽지 않아야 함
  assert.deepEqual(decodeAccelerators(b.bytes()), [
    { keys: "Ctrl+S", commandId: 3 },
    { keys: "Ctrl+Shift+N", commandId: 8 },
    { keys: "F5", commandId: 26 },
  ]);
});

test("stringtable: 블록 번호로 ID 계산, 빈 칸 건너뜀", () => {
  const b = new Builder();
  b.u16(0); // ID 16 비어 있음
  b.u16(2).u16("저".charCodeAt(0)).u16("장".charCodeAt(0)); // ID 17
  for (let i = 0; i < 14; i++) b.u16(0);
  assert.deepEqual(decodeStringBlock(b.bytes(), 2), [{ id: 17, text: "저장" }]);
});

function versionNode(key: string, type: number, value: Uint8Array, valueLength: number, children: Uint8Array[]): Uint8Array {
  const b = new Builder().u16(0).u16(valueLength).u16(type).str(key).align4();
  for (const v of value) b.u8(v);
  b.align4();
  children.forEach((c, i) => {
    for (const v of c) b.u8(v);
    if (i < children.length - 1) b.align4();
  });
  b.setU16(0, b.length);
  return b.bytes();
}

test("versioninfo: 고정 버전과 StringFileInfo", () => {
  const fixed = new Builder().u32(0xfeef04bd).u32(0x10000).u32((10 << 16) | 0).u32((19041 << 16) | 1).u32((10 << 16) | 0).u32((19041 << 16) | 1);
  for (let i = 0; i < 7; i++) fixed.u32(0);
  const val = (s: string) => new Builder().str(s).bytes();
  const desc = versionNode("FileDescription", 1, val("메모장"), 4, []);
  const prod = versionNode("ProductName", 1, val("Windows"), 8, []);
  const table = versionNode("041204B0", 1, new Uint8Array(), 0, [desc, prod]);
  const sfi = versionNode("StringFileInfo", 1, new Uint8Array(), 0, [table]);
  const root = versionNode("VS_VERSION_INFO", 0, fixed.bytes(), 52, [sfi]);
  const v = decodeVersionInfo(root);
  assert.equal(v.FixedFileVersion, "10.0.19041.1");
  assert.equal(v.FileDescription, "메모장");
  assert.equal(v.ProductName, "Windows");
});

test("dialog: DLGTEMPLATEEX와 서수 클래스", () => {
  const b = new Builder().u16(1).u16(0xffff).u32(0).u32(0).u32(0x40).u16(2); // 버전, 서명, helpID, exStyle, style(DS_SETFONT), 컨트롤 2개
  b.u16(0).u16(0).u16(100).u16(50).u16(0).u16(0).str("줄 이동"); // 위치, 메뉴 없음, 클래스 없음, 제목
  b.u16(9).u16(400).u8(0).u8(1).str("Segoe UI");
  b.align4().u32(0).u32(0).u32(0).u16(0).u16(0).u16(10).u16(10).u32(1).u16(0xffff).u16(0x80).str("이동").u16(0);
  b.align4().u32(0).u32(0).u32(0).u16(0).u16(0).u16(10).u16(10).u32(258).u16(0xffff).u16(0x81).u16(0).u16(0);
  const d = decodeDialog(b.bytes());
  assert.equal(d.title, "줄 이동");
  assert.deepEqual(d.controls, [
    { id: 1, className: "Button", text: "이동" },
    { id: 258, className: "Edit", text: "" },
  ]);
});

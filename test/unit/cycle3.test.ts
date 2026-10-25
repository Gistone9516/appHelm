import assert from "node:assert/strict";
import { test } from "node:test";
import { openAsar, readAsarFile } from "../../src/decoders/asar.ts";
import { decodeDfm, shortCut } from "../../src/decoders/dfm.ts";
import { formsFromManaged } from "../../src/collectors/dotnet/index.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Builder } from "./bytes.ts";

// --- DFM ---
function dfmByte(): Uint8Array {
  const b = new Builder();
  for (const c of "TPF0") b.u8(c.charCodeAt(0));
  const str = (s: string) => {
    b.u8(s.length);
    for (const c of s) b.u8(c.charCodeAt(0));
  };
  const ansiVal = (s: string) => {
    b.u8(6); // VT.String
    str(s);
  };
  // root
  str("TMainForm");
  str("MainForm");
  b.u8(7); // prop name len "Caption"
  for (const c of "Caption") b.u8(c.charCodeAt(0));
  ansiVal("Main");
  b.u8(0); // end root props
  // child button
  str("TButton");
  str("btnOK");
  const prop = (name: string) => {
    b.u8(name.length);
    for (const c of name) b.u8(c.charCodeAt(0));
  };
  prop("Caption");
  ansiVal("OK");
  prop("OnClick");
  b.u8(7); // VT.Ident
  str("btnOKClick");
  prop("ShortCut");
  b.u8(4); // VT.Int32
  const sc = 0x4000 | 0x53; // Ctrl+S
  b.u8(sc & 0xff).u8((sc >> 8) & 0xff).u8(0).u8(0);
  b.u8(0); // end button props
  b.u8(0); // end button children
  b.u8(0); // end root children
  return b.bytes();
}

test("IF-23: DFM 폼 해석 - 컴포넌트, 캡션, 단축키, 처리기", () => {
  const form = decodeDfm(dfmByte(), new TextDecoder("windows-1252"));
  assert.equal(form.className, "TMainForm");
  assert.equal(form.title, "Main");
  assert.equal(form.controls.length, 1);
  assert.deepEqual(form.controls[0], {
    name: "btnOK",
    className: "TButton",
    text: "OK",
    shortcut: "Ctrl+S",
    handlers: [{ event: "OnClick", method: "btnOKClick" }],
    parent: "MainForm",
  });
});

test("ShortCut 비트 해석", () => {
  assert.equal(shortCut(0x4000 | 0x53), "Ctrl+S");
  assert.equal(shortCut(0x8000 | 0x2000 | 0x70), "Shift+Alt+F1");
});

// --- .NET managed ---
test("IF-22: WinForms 폼 추정 - 처리기 연결과 컨트롤 종류", () => {
  const managed = {
    methods: [
      { token: "0x1", declaring_type: "App.Main", name: "InitializeComponent", signature: { parameter_count: 0 } },
      { token: "0x2", declaring_type: "App.Main", name: "btnRun_Click", signature: { parameter_count: 2 } },
      { token: "0x3", declaring_type: "App.Main", name: "txtInput_TextChanged", signature: { parameter_count: 2 } },
    ],
    fields: [
      { name: "btnRun", declaring_type: "App.Main", signature: { field_type: "class:1" } },
      { name: "txtInput", declaring_type: "App.Main", signature: { field_type: "class:2" } },
    ],
    call_edges: [
      { caller_token: "0x1", caller: "App.Main.InitializeComponent", opcode: "newobj", target_name: ".ctor", target_declaring_type: "System.Windows.Forms.Button" },
      { caller_token: "0x1", caller: "App.Main.InitializeComponent", opcode: "newobj", target_name: ".ctor", target_declaring_type: "System.Windows.Forms.TextBox" },
    ],
    field_accesses: [
      { method_token: "0x1", opcode: "stfld", field_name: "btnRun", field_declaring_type: "App.Main" },
      { method_token: "0x1", opcode: "stfld", field_name: "txtInput", field_declaring_type: "App.Main" },
    ],
    user_strings: { literals: [{ value: "btnRun" }, { value: "실행" }, { value: "txtInput" }] },
  };
  const forms = formsFromManaged(managed);
  assert.equal(forms.length, 1);
  const byName = Object.fromEntries(forms[0]!.controls.map((c) => [c.name, c]));
  assert.equal(byName.btnRun!.className, "Button");
  assert.equal(byName.btnRun!.text, "실행");
  assert.deepEqual(byName.btnRun!.handlers, [{ event: "Click", method: "btnRun_Click" }]);
  assert.equal(byName.txtInput!.className, "TextBox");
});

// --- asar ---
test("IF-24: asar 파일 읽기", () => {
  const dir = mkdtempSync(join(tmpdir(), "asar-"));
  const content = Buffer.from('{"name":"demo","main":"index.js"}', "utf8");
  const header = Buffer.from(JSON.stringify({ files: { "package.json": { size: content.length, offset: "0" } } }), "utf8");
  // pickle: [4][headerPayloadSize][headerObjSize][jsonSize][json...][content...]
  const aligned = header.length + ((4 - (header.length % 4)) % 4);
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(aligned + 8, 4);
  prefix.writeUInt32LE(aligned + 4, 8);
  prefix.writeUInt32LE(header.length, 12);
  const pad = Buffer.alloc(aligned - header.length);
  const file = join(dir, "app.asar");
  writeFileSync(file, Buffer.concat([prefix, header, pad, content]));
  const asar = openAsar(file);
  const got = readAsarFile(asar, "package.json");
  assert.ok(got);
  assert.deepEqual(JSON.parse(got!.toString("utf8")), { name: "demo", main: "index.js" });
  assert.equal(readAsarFile(asar, "missing.js"), null);
});

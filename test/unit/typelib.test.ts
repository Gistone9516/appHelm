import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { dumpTypelib, formatMembers, searchTypelib, type TypeLibDump } from "../../src/typelib/index.ts";

const skip = process.platform !== "win32";

const LIB: TypeLibDump = {
  file: "x.olb",
  name: "X",
  memberCount: 6,
  truncated: false,
  types: [
    { name: "_Document", kind: "dispatch", hidden: true, members: [
      { name: "Name", kind: "get", params: [], returns: "String" },
      { name: "Saved", kind: "get", params: [], returns: "Boolean" },
      { name: "Saved", kind: "put", params: [{ name: "prop", type: "Boolean" }], returns: "void" },
      { name: "SaveAs2", kind: "method", params: [{ name: "FileName", type: "Variant", opt: true }, { name: "FileFormat", type: "Variant", opt: true, def: 0 }], returns: "void" },
    ] },
    { name: "Document", kind: "coclass", implements: [{ name: "_Document", default: true }, { name: "DocumentEvents", events: true }], members: [] },
    { name: "WdSaveFormat", kind: "enum", members: [{ name: "wdFormatDocument", kind: "const", value: 0 }, { name: "wdFormatPDF", kind: "const", value: 17 }] },
  ],
};

test("IF-31: 서명 한 줄 — get/put 합치기, 선택 인자와 기본값, 상수", () => {
  assert.deepEqual(formatMembers(LIB.types[0]!), [
    "_Document.Name: String (get)",
    "_Document.Saved: Boolean (get/put)",
    "_Document.SaveAs2(FileName?: Variant, FileFormat?: Variant = 0) -> void",
  ]);
  assert.deepEqual(formatMembers(LIB.types[2]!), ["WdSaveFormat.wdFormatDocument = 0", "WdSaveFormat.wdFormatPDF = 17"]);
});

test("IF-31: coclass 이름으로 찾으면 기본 인터페이스의 멤버를 보여 준다", () => {
  const r = searchTypelib(LIB, "Document");
  assert.equal(r.lines[0], "# Document (coclass -> dispatch)");
  assert.ok(r.lines.includes("Document.SaveAs2(FileName?: Variant, FileFormat?: Variant = 0) -> void"));
});

test("IF-31: 형식.멤버와 부분 문자열 찾기 (coclass 중복 없음)", () => {
  assert.deepEqual(searchTypelib(LIB, "document.saveas").lines, ["Document.SaveAs2(FileName?: Variant, FileFormat?: Variant = 0) -> void"]);
  const r = searchTypelib(LIB, "pdf");
  assert.deepEqual(r.lines, ["WdSaveFormat.wdFormatPDF = 17"]);
  assert.equal(searchTypelib(LIB, "saveas2").lines.length, 1);
});

test("IF-31: 실제 타입 라이브러리 덤프 — 매개변수 타입, 기본값, 열거형 값 (scrrun.dll)", { skip }, async () => {
  const workDir = join(tmpdir(), "apphelm-test");
  mkdirSync(workDir, { recursive: true });
  const prev = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = join(workDir, "la"); // 사용자 캐시를 건드리지 않는다
  try {
    const r = await dumpTypelib(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "scrrun.dll"), { workDir, timeoutMs: 120000 });
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;
    assert.equal(r.dump.name, "Scripting");
    const lines = searchTypelib(r.dump, "IFileSystem3.CopyFile").lines;
    assert.deepEqual(lines, ["IFileSystem3.CopyFile(Source: String, Destination: String, OverWriteFiles?: Boolean = true) -> void"]);
    assert.ok(searchTypelib(r.dump, "TextCompare").lines.includes("CompareMethod.TextCompare = 1"));
  } finally {
    process.env.LOCALAPPDATA = prev;
  }
});

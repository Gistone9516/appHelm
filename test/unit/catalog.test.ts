import assert from "node:assert/strict";
import { test } from "node:test";
import { controlsFromRows, invokeStepOf, scanIdentifiers, searchCatalog, validateMso, type CommandCatalog, type StepRunner } from "../../src/catalog/index.ts";

const utf16 = (s: string) => new Uint8Array(Buffer.from(s, "utf16le"));

test("IF-32: 바이너리에서 PascalCase UTF-16 식별자만 뽑는다", () => {
  const buf = utf16("FileSave\u0000bold\u0000AB\u0000TableInsertTable\u0000FileSave\u0000X1y\u0000ALLCAPS");
  assert.deepEqual(scanIdentifiers(buf), ["FileSave", "TableInsertTable", "X1y"]);
});

test("IF-32: 컨트롤 행 — 단축키 표시를 빼고, 같은 ID·이름은 하나로, 오류 칸은 버린다", () => {
  const rows = [
    { Id: 113, Caption: "굵게​​(&B)", Type: 1, "Parent.Name": "Formatting" },
    { Id: 113, Caption: "굵게(&B)", Type: 1, "Parent.Name": "Menu" },
    { Id: 0, Caption: "사용자", Type: 1, "Parent.Name": "x" },
    { Id: 5, Caption: "!오류", Type: 1, "Parent.Name": "x" },
  ];
  assert.deepEqual(controlsFromRows(rows), [{ kind: "control", id: 113, label: "굵게", bar: "Formatting", controlType: 1 }]);
});

test("IF-32: GetLabelMso가 성공한 이름만 리본 명령으로 남긴다", async () => {
  const run: StepRunner = async (steps) => ({
    ok: true,
    steps: steps.map((s, i) => {
      const path = (s as { path: string }).path;
      return path.includes('"Bold"') ? { i, ok: true, result: "굵게​" } : { i, ok: false, error: "E_INVALIDARG" };
    }),
  });
  assert.deepEqual(await validateMso(run, ["Bold", "NoSuch"]), [{ kind: "mso", id: "Bold", label: "굵게" }]);
});

test("IF-32: 찾기 결과는 리본 명령이 먼저이고 실행 단계를 함께 준다", () => {
  const c: CommandCatalog = {
    progId: "Word.Application",
    builtAt: "",
    entries: [
      { kind: "control", id: 113, label: "굵게", bar: "Formatting" },
      { kind: "mso", id: "BoldRun", label: "굵게" },
    ],
  };
  const r = searchCatalog(c, "굵게");
  assert.equal(r.total, 2);
  assert.equal(r.lines[0], '굵게\tidMso BoldRun\tCommandBars.ExecuteMso("BoldRun")');
  assert.equal(invokeStepOf(c.entries[0]!).path, "CommandBars.FindControl(missing, 113).Execute");
});

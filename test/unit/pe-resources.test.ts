import assert from "node:assert/strict";
import { test } from "node:test";
import type { PeImage } from "../../src/pe/pe.ts";
import { readResources } from "../../src/pe/resources.ts";

// 섹션 하나(VA 0x1000 → 파일 0x200)에 리소스 디렉터리를 직접 만든다. 모든 위치는 디렉터리 시작 기준이다.
function image(): PeImage {
  const buf = new Uint8Array(0x400);
  const view = new DataView(buf.buffer);
  const B = 0x200;
  const dir = (at: number, entries: [number, number][]) => {
    view.setUint16(B + at + 14, entries.length, true); // 개수만 맞으면 이름/ID 구분은 항목 비트로 한다
    entries.forEach(([name, target], i) => {
      view.setUint32(B + at + 16 + i * 8, name, true);
      view.setUint32(B + at + 20 + i * 8, target, true);
    });
  };
  const str = (at: number, s: string) => {
    view.setUint16(B + at, s.length, true);
    for (let i = 0; i < s.length; i++) view.setUint16(B + at + 2 + i * 2, s.charCodeAt(i), true);
  };
  const SUB = 0x80000000;
  dir(0x00, [[SUB | 0x100, SUB | 0x20], [4, SUB | 0x40]]); // 형식: "UIFILE", RT_MENU
  dir(0x20, [[1, SUB | 0x60]]); // 이름 1
  dir(0x40, [[SUB | 0x110, SUB | 0x78]]); // 이름 "MAIN"
  dir(0x60, [[1042, 0x90]]); // 언어 → 데이터 항목
  dir(0x78, [[0, 0xa0]]);
  view.setUint32(B + 0x90, 0x10c0, true); // 데이터 RVA
  view.setUint32(B + 0x94, 4, true);
  view.setUint32(B + 0xa0, 0x10d0, true);
  view.setUint32(B + 0xa4, 2, true);
  str(0x100, "UIFILE");
  str(0x110, "MAIN");
  return {
    info: { machine: 0x8664, is64: true, isDll: false, subsystem: 2, isDotNet: false },
    sections: [{ va: 0x1000, vsize: 0x200, raw: 0x200, rawSize: 0x200 }],
    dirs: [{ rva: 0, size: 0 }, { rva: 0, size: 0 }, { rva: 0x1000, size: 0x120 }],
    buf,
    view,
  };
}

test("IF-6: 3단계 리소스 디렉터리를 파일 위치 목록으로 읽는다 (이름·ID 항목 모두)", () => {
  assert.deepEqual(readResources(image()), [
    { type: "UIFILE", name: 1, lang: 1042, offset: 0x2c0, bytes: 4 },
    { type: 4, name: "MAIN", lang: 0, offset: 0x2d0, bytes: 2 },
  ]);
});

test("IF-6: 리소스 디렉터리가 없으면 빈 목록이다", () => {
  const img = image();
  img.dirs[2] = { rva: 0, size: 0 };
  assert.deepEqual(readResources(img), []);
});

test("IF-6: 자기 자신을 가리키는 하위 디렉터리에서 멈춘다", () => {
  const img = image();
  img.view.setUint32(0x200 + 0x20 + 20, 0x80000000 | 0x20, true); // 이름 단계가 자기 자신을 가리킴
  assert.equal(readResources(img).length, 1);
});

test("IF-6: 데이터가 파일 밖을 가리키는 잎은 건너뛴다", () => {
  const img = image();
  img.view.setUint32(0x200 + 0xa4, 0x10000, true);
  assert.equal(readResources(img).length, 1);
});

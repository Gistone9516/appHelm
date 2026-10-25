// IF-6: PE 리소스 디렉터리(형식 → 이름 → 언어 3단계)를 직접 순회해 리소스 위치 목록을 만든다.
import { rvaToOffset, type PeImage } from "./pe.ts";

export interface ResourceEntry {
  type: number | string;
  name: number | string;
  lang: number | null;
  /** 파일 안 위치(RVA가 아니다). 해석기는 buf.subarray(offset, offset + bytes)로 자른다. */
  offset: number;
  bytes: number;
}

const MAX_ENTRIES = 20000;

export function readResources(img: PeImage): ResourceEntry[] {
  const dir = img.dirs[2];
  if (!dir || !dir.rva || !dir.size) return [];
  const base = rvaToOffset(img, dir.rva);
  if (base === null) return [];
  const { view, buf } = img;
  const out: ResourceEntry[] = [];
  const visited = new Set<number>();

  // 이름 항목은 디렉터리 시작 기준 위치에 길이(UTF-16 글자 수) + 글자로 저장된다
  const nameAt = (rel: number): string | null => {
    const at = base + rel;
    if (at + 2 > buf.byteLength) return null;
    const len = view.getUint16(at, true);
    if (at + 2 + len * 2 > buf.byteLength) return null;
    return new TextDecoder("utf-16le").decode(buf.subarray(at + 2, at + 2 + len * 2));
  };

  const walk = (rel: number, depth: number, path: (number | string)[]): void => {
    const at = base + rel;
    if (depth > 2 || visited.has(at) || at + 16 > buf.byteLength) return;
    visited.add(at);
    const count = view.getUint16(at + 12, true) + view.getUint16(at + 14, true);
    for (let i = 0; i < count && out.length < MAX_ENTRIES; i++) {
      const e = at + 16 + i * 8;
      if (e + 8 > buf.byteLength) return;
      const nameField = view.getUint32(e, true);
      const target = view.getUint32(e + 4, true);
      const id: number | string | null = nameField & 0x80000000 ? nameAt(nameField & 0x7fffffff) : nameField & 0xffff;
      if (id === null) continue;
      if (target & 0x80000000) {
        walk(target & 0x7fffffff, depth + 1, [...path, id]);
        continue;
      }
      if (depth !== 2) continue; // 3단계가 아닌 잎은 형식이 깨진 것이다
      const data = base + target;
      if (data + 16 > buf.byteLength) continue;
      const offset = rvaToOffset(img, view.getUint32(data, true));
      const bytes = view.getUint32(data + 4, true);
      if (offset === null || offset + bytes > buf.byteLength) continue;
      const [type, name] = path as [number | string, number | string];
      out.push({ type, name, lang: typeof id === "number" ? id : null, offset, bytes });
    }
  };

  walk(0, 0, []);
  return out;
}

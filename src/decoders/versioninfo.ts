// RT_VERSION(16) 해석. VS_VERSIONINFO 트리에서 고정 버전과 StringFileInfo 값을 꺼낸다.
import { DecodeError, Reader } from "./reader.ts";

interface Node {
  key: string;
  type: number;
  valueStart: number;
  valueLength: number;
  childrenStart: number;
  end: number;
}

function readNode(r: Reader, start: number): Node {
  r.pos = start;
  const length = r.u16();
  const valueLength = r.u16();
  const type = r.u16();
  const key = r.utf16z();
  r.align4();
  const valueStart = r.pos;
  const valueBytes = type === 1 ? valueLength * 2 : valueLength;
  const end = Math.min(start + length, r.length);
  if (length === 0) throw new DecodeError("길이 0인 버전 노드");
  const childrenStart = Math.min((valueStart + valueBytes + 3) & ~3, end);
  return { key, type, valueStart, valueLength, childrenStart, end };
}

function children(r: Reader, n: Node): Node[] {
  const out: Node[] = [];
  let pos = n.childrenStart;
  while (pos + 6 <= n.end) {
    const c = readNode(r, pos);
    out.push(c);
    pos = (c.end + 3) & ~3;
  }
  return out;
}

export function decodeVersionInfo(bytes: Uint8Array): Record<string, string> {
  const r = new Reader(bytes);
  const root = readNode(r, 0);
  if (root.key !== "VS_VERSION_INFO") throw new DecodeError(`VS_VERSION_INFO가 아님: ${root.key}`);
  const out: Record<string, string> = {};

  if (root.valueLength >= 52) {
    r.pos = root.valueStart;
    if (r.u32() === 0xfeef04bd) {
      r.u32(); // struc version
      const fms = r.u32(), fls = r.u32(), pms = r.u32(), pls = r.u32();
      const v = (ms: number, ls: number) => `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
      out.FixedFileVersion = v(fms, fls);
      out.FixedProductVersion = v(pms, pls);
    }
  }

  for (const block of children(r, root)) {
    if (block.key !== "StringFileInfo") continue;
    for (const table of children(r, block)) {
      for (const s of children(r, table)) {
        r.pos = s.valueStart;
        const count = Math.max(0, Math.min(s.valueLength, (s.end - s.valueStart) / 2));
        const value = r.utf16n(count).replace(/\u0000+$/, "");
        if (!(s.key in out)) out[s.key] = value;
      }
    }
  }
  return out;
}

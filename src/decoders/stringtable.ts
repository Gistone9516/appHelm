// RT_STRING(6) 해석. 블록 번호 N에는 문자열 ID (N-1)*16 ~ (N-1)*16+15가 들어 있다.
import { Reader } from "./reader.ts";

export function decodeStringBlock(bytes: Uint8Array, blockId: number): { id: number; text: string }[] {
  const r = new Reader(bytes);
  const out: { id: number; text: string }[] = [];
  const base = (blockId - 1) * 16;
  for (let i = 0; i < 16 && !r.eof; i++) {
    const len = r.u16();
    if (len === 0) continue;
    out.push({ id: base + i, text: r.utf16n(len) });
  }
  return out;
}

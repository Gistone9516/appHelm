// IF-8: PE 헤더와 import 표를 직접 읽는다. 리소스 디렉터리는 resources.ts가 읽는다 (IF-6).
import type { PeInfo } from "../core/types.ts";

export class PeError extends Error {}

interface Section {
  va: number;
  vsize: number;
  raw: number;
  rawSize: number;
}

export interface PeImage {
  info: PeInfo;
  sections: Section[];
  dirs: { rva: number; size: number }[];
  buf: Uint8Array;
  view: DataView;
}

export interface ImportedDll {
  dll: string;
  functions: string[];
  delayLoad: boolean;
}

export function parsePe(buf: Uint8Array): PeImage {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 0x40 || view.getUint16(0, true) !== 0x5a4d) throw new PeError("MZ 서명이 없습니다");
  const pe = view.getUint32(0x3c, true);
  if (pe + 24 > buf.byteLength || view.getUint32(pe, true) !== 0x00004550) throw new PeError("PE 서명이 없습니다");
  const coff = pe + 4;
  const machine = view.getUint16(coff, true);
  const nSections = view.getUint16(coff + 2, true);
  const optSize = view.getUint16(coff + 16, true);
  const characteristics = view.getUint16(coff + 18, true);
  const opt = coff + 20;
  const magic = view.getUint16(opt, true);
  if (magic !== 0x10b && magic !== 0x20b) throw new PeError(`알 수 없는 optional header magic 0x${magic.toString(16)}`);
  const is64 = magic === 0x20b;
  const subsystem = view.getUint16(opt + 68, true);
  const nDirsAt = opt + (is64 ? 108 : 92);
  const nDirs = Math.min(view.getUint32(nDirsAt, true), 16);
  const dirs: { rva: number; size: number }[] = [];
  for (let i = 0; i < nDirs; i++) {
    const at = nDirsAt + 4 + i * 8;
    dirs.push({ rva: view.getUint32(at, true), size: view.getUint32(at + 4, true) });
  }
  const sections: Section[] = [];
  const secStart = opt + optSize;
  for (let i = 0; i < nSections; i++) {
    const s = secStart + i * 40;
    if (s + 40 > buf.byteLength) break;
    sections.push({
      vsize: view.getUint32(s + 8, true),
      va: view.getUint32(s + 12, true),
      rawSize: view.getUint32(s + 16, true),
      raw: view.getUint32(s + 20, true),
    });
  }
  const clr = dirs[14];
  return {
    info: {
      machine,
      is64,
      isDll: (characteristics & 0x2000) !== 0,
      subsystem,
      isDotNet: !!clr && clr.rva !== 0 && clr.size !== 0,
    },
    sections,
    dirs,
    buf,
    view,
  };
}

export function rvaToOffset(img: PeImage, rva: number): number | null {
  for (const s of img.sections) {
    const span = Math.max(s.vsize, s.rawSize);
    if (rva >= s.va && rva < s.va + span) {
      const off = s.raw + (rva - s.va);
      return off < img.buf.byteLength ? off : null;
    }
  }
  return null;
}

function asciiz(img: PeImage, rva: number): string | null {
  const off = rvaToOffset(img, rva);
  if (off === null) return null;
  let end = off;
  while (end < img.buf.byteLength && img.buf[end] !== 0 && end - off < 512) end++;
  return new TextDecoder("latin1").decode(img.buf.subarray(off, end));
}

function readThunks(img: PeImage, rva: number): string[] {
  const names: string[] = [];
  let off = rvaToOffset(img, rva);
  if (off === null) return names;
  const step = img.info.is64 ? 8 : 4;
  for (let i = 0; i < 65536 && off + step <= img.buf.byteLength; i++, off += step) {
    let isOrdinal: boolean;
    let value: number;
    if (img.info.is64) {
      const v = img.view.getBigUint64(off, true);
      if (v === 0n) break;
      isOrdinal = (v & 0x8000000000000000n) !== 0n;
      value = Number(v & 0xffffffffn);
    } else {
      const v = img.view.getUint32(off, true);
      if (v === 0) break;
      isOrdinal = (v & 0x80000000) !== 0;
      value = v & 0x7fffffff;
    }
    if (isOrdinal) names.push(`#${value & 0xffff}`);
    else {
      const n = asciiz(img, value + 2);
      if (n) names.push(n);
    }
  }
  return names;
}

export function readImports(img: PeImage): ImportedDll[] {
  const out: ImportedDll[] = [];
  const imp = img.dirs[1];
  if (imp && imp.rva) {
    let off = rvaToOffset(img, imp.rva);
    for (let i = 0; off !== null && i < 4096 && off + 20 <= img.buf.byteLength; i++, off += 20) {
      const oft = img.view.getUint32(off, true);
      const nameRva = img.view.getUint32(off + 12, true);
      const ft = img.view.getUint32(off + 16, true);
      if (nameRva === 0 && ft === 0) break;
      const dll = asciiz(img, nameRva);
      if (!dll) continue;
      out.push({ dll, functions: readThunks(img, oft || ft), delayLoad: false });
    }
  }
  const delay = img.dirs[13];
  if (delay && delay.rva) {
    let off = rvaToOffset(img, delay.rva);
    for (let i = 0; off !== null && i < 4096 && off + 32 <= img.buf.byteLength; i++, off += 32) {
      const attrs = img.view.getUint32(off, true);
      const nameRva = img.view.getUint32(off + 4, true);
      const intRva = img.view.getUint32(off + 16, true);
      if (nameRva === 0) break;
      if ((attrs & 1) === 0) continue; // 오래된 VA 기반 형식은 건너뛴다
      const dll = asciiz(img, nameRva);
      if (!dll) continue;
      out.push({ dll, functions: readThunks(img, intRva), delayLoad: true });
    }
  }
  return out;
}

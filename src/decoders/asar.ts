// Electron asar 아카이브에서 특정 파일을 꺼낸다. 헤더는 Chromium Pickle 형식이다.
import { openSync, readSync, closeSync } from "node:fs";
import { DecodeError } from "./reader.ts";

interface AsarEntry {
  size: number;
  offset: string;
}
interface AsarDir {
  files: Record<string, AsarEntry | AsarDir>;
}

export interface Asar {
  header: AsarDir;
  contentBase: number;
  path: string;
}

/** asar 헤더를 읽는다. 데이터 영역은 헤더 뒤에서 시작한다. */
export function openAsar(path: string): Asar {
  const fd = openSync(path, "r");
  try {
    const prefix = Buffer.alloc(16);
    if (readSync(fd, prefix, 0, 16, 0) < 16) throw new DecodeError("asar 헤더가 너무 짧습니다");
    const headerPickleSize = prefix.readUInt32LE(4); // 크기 필드(4) 다음의 전체 헤더 크기
    const jsonSize = prefix.readUInt32LE(12);
    const jsonBuf = Buffer.alloc(jsonSize);
    if (readSync(fd, jsonBuf, 0, jsonSize, 16) < jsonSize) throw new DecodeError("asar 헤더 JSON을 다 읽지 못했습니다");
    const header = JSON.parse(jsonBuf.toString("utf8")) as AsarDir;
    const contentBase = 8 + headerPickleSize;
    return { header, contentBase, path };
  } finally {
    closeSync(fd);
  }
}

function lookup(dir: AsarDir, parts: string[]): AsarEntry | null {
  let cur: AsarDir | AsarEntry = dir;
  for (const part of parts) {
    if (!("files" in cur)) return null;
    const next: AsarEntry | AsarDir | undefined = cur.files[part];
    if (!next) return null;
    cur = next;
  }
  return "files" in cur ? null : cur;
}

/** asar 안의 파일을 읽는다. 없으면 null. */
export function readAsarFile(asar: Asar, relPath: string): Buffer | null {
  const entry = lookup(asar.header, relPath.split(/[\\/]/));
  if (!entry) return null;
  const fd = openSync(asar.path, "r");
  try {
    const buf = Buffer.alloc(entry.size);
    const got = readSync(fd, buf, 0, entry.size, asar.contentBase + Number(entry.offset));
    return buf.subarray(0, got);
  } finally {
    closeSync(fd);
  }
}

/** 최상위 파일 이름 목록 (진단용) */
export function topLevelNames(asar: Asar): string[] {
  return Object.keys(asar.header.files);
}

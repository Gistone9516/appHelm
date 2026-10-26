// 실행 파일 안의 Qt 리소스 표(rcc)를 심볼 없이 찾아 파일을 꺼낸다 (IF-36).
// 표 세 개: 이름(길이 2바이트 + 해시 4바이트 + UTF-16BE 글자), 구조(항목 22 또는 14바이트), 데이터(길이 4바이트 + 내용).
import { inflateSync } from "node:zlib";

export const QRC_LIMITS = { maxTrees: 50, maxFiles: 20000, maxInflatedBytes: 64 * 1024 * 1024 };

const FLAG_COMPRESSED = 1;
const FLAG_DIRECTORY = 2;
const FLAG_ZSTD = 4;

export interface QrcFile {
  path: string;
  /** zstd처럼 풀지 못한 파일은 null */
  data: Uint8Array | null;
  compression: "none" | "zlib" | "zstd";
}

export interface QrcResult {
  files: QrcFile[];
  trees: number;
  skippedZstd: number;
  truncated: boolean;
}

interface RawFile {
  nameOffset: number;
  flags: number;
  dataOffset: number;
  /** 뿌리 아래 폴더들의 이름 오프셋 */
  dirs: number[];
}

const QML_UTF16 = [0x00, 0x2e, 0x00, 0x71, 0x00, 0x6d, 0x00, 0x6c]; // ".qml"

function indexOfSeq(b: Uint8Array, seq: number[], from: number): number {
  outer: for (let i = from; i <= b.length - seq.length; i++) {
    for (let k = 0; k < seq.length; k++) if (b[i + k] !== seq[k]) continue outer;
    return i;
  }
  return -1;
}

/** `.qml`로 끝나는 이름 항목의 시작 위치들 */
function findNameEntries(b: Uint8Array, be16: (o: number) => number): Set<number> {
  const starts = new Set<number>();
  let i = indexOfSeq(b, QML_UTF16, 0);
  while (i >= 0) {
    const end = i + QML_UTF16.length;
    for (let n = 5; n < 120; n++) {
      const s = end - 2 * n - 6;
      if (s < 0) break;
      if (be16(s) === n) {
        starts.add(s);
        break;
      }
    }
    i = indexOfSeq(b, QML_UTF16, i + 2);
  }
  return starts;
}

export function readQrc(b: Uint8Array): QrcResult {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const be16 = (o: number) => view.getUint16(o, false);
  const be32 = (o: number) => view.getUint32(o, false);
  const inRange = (o: number, n: number) => o >= 0 && o + n <= b.length;

  const nameEntries = findNameEntries(b, be16);
  const result: QrcResult = { files: [], trees: 0, skippedZstd: 0, truncated: false };
  if (!nameEntries.size) return result;

  // 뿌리 후보: 이름 0, 플래그 2(폴더), 자식 수, 첫 자식 1
  const roots: number[] = [];
  // 표는 바이트 배열이라 정렬을 가정하지 않는다
  for (let k = 0; k + 14 <= b.length; k++) {
    if (b[k + 5] === FLAG_DIRECTORY && b[k + 13] === 1 && be32(k) === 0 && be16(k + 4) === FLAG_DIRECTORY && be32(k + 10) === 1) {
      const cnt = be32(k + 6);
      if (cnt > 0 && cnt < 5000) roots.push(k);
    }
  }

  let inflated = 0;
  const taken = new Set<number>(); // 같은 데이터를 두 나무가 가리키면 한 번만 담는다
  for (const root of roots) {
    if (result.trees >= QRC_LIMITS.maxTrees) {
      result.truncated = true;
      break;
    }
    const tree = walkTree(root);
    if (!tree) continue;
    const namesBase = vote(tree.files.map((f) => f.nameOffset), [...nameEntries]);
    if (namesBase === null) continue;
    // 바이트 단위로 훑으면 우연히 맞는 가짜 뿌리가 있다. 이름이 95% 이상 출력 가능한 ASCII여야 진짜로 본다
    const names = tree.files.flatMap((f) => [...f.dirs, f.nameOffset]).map((off) => nameAt(namesBase.base, off));
    if (names.filter((n) => /^[ -~]{1,255}$/.test(n)).length < names.length * 0.95) continue;
    const dataBase = findDataBase(tree.files);
    if (dataBase === null) continue;
    result.trees++;
    for (const f of tree.files) {
      if (result.files.length >= QRC_LIMITS.maxFiles || inflated >= QRC_LIMITS.maxInflatedBytes) {
        result.truncated = true;
        break;
      }
      const path = "/" + [...f.dirs, f.nameOffset].map((off) => nameAt(namesBase.base, off)).join("/");
      const o = dataBase + f.dataOffset;
      if (!inRange(o, 4) || taken.has(o)) continue;
      taken.add(o);
      const len = be32(o);
      if (!inRange(o + 4, len)) continue;
      if (f.flags & FLAG_ZSTD) {
        result.skippedZstd++;
        result.files.push({ path, data: null, compression: "zstd" });
      } else if (f.flags & FLAG_COMPRESSED) {
        try {
          const data = new Uint8Array(inflateSync(b.subarray(o + 8, o + 4 + len)));
          inflated += data.length;
          result.files.push({ path, data, compression: "zlib" });
        } catch {
          // 깨진 압축은 건너뛴다
        }
      } else {
        result.files.push({ path, data: b.subarray(o + 4, o + 4 + len), compression: "none" });
      }
    }
  }
  return result;

  function walkTree(root: number): { entrySize: number; files: RawFile[] } | null {
    for (const size of [22, 14]) {
      const files: RawFile[] = [];
      const stack: { idx: number; dirs: number[] }[] = [{ idx: 0, dirs: [] }];
      let ok = true;
      let seen = 0;
      while (stack.length && seen < QRC_LIMITS.maxFiles * 2) {
        const { idx, dirs } = stack.pop()!;
        const o = root + idx * size;
        if (!inRange(o, 14)) {
          ok = false;
          break;
        }
        seen++;
        const flags = be16(o + 4);
        if (flags & FLAG_DIRECTORY) {
          const cnt = be32(o + 6);
          const first = be32(o + 10);
          if (cnt > 5000 || first > 100000 || (idx > 0 && first <= idx)) {
            ok = false;
            break;
          }
          const sub = idx === 0 ? dirs : [...dirs, be32(o)];
          for (let c = first; c < first + cnt; c++) stack.push({ idx: c, dirs: sub });
        } else {
          if (flags & ~(FLAG_COMPRESSED | FLAG_ZSTD)) {
            ok = false;
            break;
          }
          files.push({ nameOffset: be32(o), flags, dataOffset: be32(o + 10), dirs });
        }
      }
      if (ok && files.length) return { entrySize: size, files };
    }
    return null;
  }

  /** 이름 오프셋 + 기준 = 실제 이름 항목인 기준을 표로 고른다 */
  function vote(offsets: number[], entries: number[]): { base: number; hits: number } | null {
    const counts = new Map<number, number>();
    for (const off of offsets) for (const e of entries) if (e - off >= 0) counts.set(e - off, (counts.get(e - off) ?? 0) + 1);
    let best: { base: number; hits: number } | null = null;
    for (const [base, hits] of counts) if (!best || hits > best.hits || (hits === best.hits && base < best.base)) best = { base, hits };
    return best;
  }

  /** 압축 안 된 QML 레코드나 zlib 레코드 위치에서 데이터 표 시작을 고른다 */
  function findDataBase(files: RawFile[]): number | null {
    const plain = files.filter((f) => !(f.flags & (FLAG_COMPRESSED | FLAG_ZSTD))).slice(0, 8);
    const packed = files.filter((f) => f.flags & FLAG_COMPRESSED).slice(0, 4);
    const candidates = new Set<number>();
    const seeds: number[] = [];
    const imp = [0x69, 0x6d, 0x70, 0x6f, 0x72, 0x74, 0x20]; // "import "
    for (let j = indexOfSeq(b, imp, 0); j >= 0 && seeds.length < 2000; j = indexOfSeq(b, imp, j + 7)) {
      for (let back = 0; back < 4000; back++) {
        const s = j - back - 4;
        if (s < 0) break;
        if (be32(s) > back && be32(s) < 4_000_000) {
          seeds.push(s);
          break;
        }
      }
    }
    for (const s of seeds) for (const f of plain) if (s - f.dataOffset >= 0) candidates.add(s - f.dataOffset);
    // 압축 안 된 파일로 못 찾을 때만 zlib 머리를 훑는다 (후보가 많아 비싸다)
    if (!candidates.size && packed.length) {
      for (let z = 8; z < b.length - 1 && candidates.size < 20000; z++) {
        if (b[z] !== 0x78 || ((b[z]! << 8) | b[z + 1]!) % 31 !== 0) continue;
        for (const f of packed) if (z - 8 - f.dataOffset >= 0) candidates.add(z - 8 - f.dataOffset);
      }
    }
    let best: number | null = null;
    let bestScore = 0;
    for (const base of candidates) {
      let score = 0;
      for (const f of files) {
        const o = base + f.dataOffset;
        if (!inRange(o, 4)) continue;
        const len = be32(o);
        if (!inRange(o + 4, len)) continue;
        if (f.flags & FLAG_COMPRESSED) {
          if (len > 6 && b[o + 8] === 0x78 && ((b[o + 8]! << 8) | b[o + 9]!) % 31 === 0) score++;
        } else score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = base;
      }
    }
    return bestScore >= Math.max(1, Math.ceil(files.length * 0.8)) ? best : null;
  }

  function nameAt(base: number, off: number): string {
    const o = base + off;
    if (!inRange(o, 6)) return "?";
    const n = be16(o);
    if (!inRange(o + 6, n * 2)) return "?";
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(be16(o + 6 + i * 2));
    return s;
  }
}

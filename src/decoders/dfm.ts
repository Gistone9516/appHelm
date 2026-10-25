// Delphi 이진 폼(DFM)을 읽는다. RCDATA 리소스가 "TPF0"으로 시작할 때 쓴다. (IF-23)
import type { FormControl } from "../core/types.ts";
import { DecodeError, Reader } from "./reader.ts";

// ValueType (Delphi TValueType)
const VT = { Null: 0, List: 1, Int8: 2, Int16: 3, Int32: 4, Extended: 5, String: 6, Ident: 7, False: 8, True: 9, Binary: 10, Set: 11, LString: 12, Nil: 13, Collection: 14, Single: 15, Currency: 16, Date: 17, WString: 18, Int64: 19, UTF8String: 20, Double: 21 } as const;

const VK_NAMES: Record<number, string> = {
  0x08: "Backspace", 0x09: "Tab", 0x0d: "Enter", 0x1b: "Esc", 0x20: "Space",
  0x21: "PgUp", 0x22: "PgDn", 0x23: "End", 0x24: "Home", 0x2d: "Ins", 0x2e: "Del",
};
function vkName(vk: number): string {
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  return VK_NAMES[vk] ?? `0x${vk.toString(16)}`;
}

export class DfmReader extends Reader {
  constructor(bytes: Uint8Array, private readonly ansiDecoder: TextDecoder) {
    super(bytes);
  }

  len8str(): string {
    const n = this.u8();
    const s = this.ansiDecoder.decode(this.bytes.subarray(this.pos, this.pos + n));
    this.skip(n);
    return s;
  }

  value(): unknown {
    const vt = this.u8();
    switch (vt) {
      case VT.Null: return null;
      case VT.Int8: return this.u8() << 24 >> 24;
      case VT.Int16: return this.i16();
      case VT.Int32: return this.u32() | 0;
      case VT.Int64: { const lo = this.u32(); const hi = this.u32(); return hi * 2 ** 32 + lo; }
      case VT.False: return false;
      case VT.True: return true;
      case VT.String: return this.len8str();
      case VT.Ident: return { ident: this.len8str() };
      case VT.LString: case VT.UTF8String: { const n = this.u32(); const s = this.readAnsi(n, vt === VT.UTF8String); this.skip(n); return s; }
      case VT.WString: { const n = this.u32(); const s = this.utf16n(n); return s; }
      case VT.Set: { const items: string[] = []; for (let s = this.len8str(); s !== ""; s = this.len8str()) items.push(s); return items; }
      case VT.List: { const items: unknown[] = []; while (this.peekByte() !== 0) items.push(this.value()); this.skip(1); return items; }
      case VT.Collection: { const items: unknown[] = []; while (this.peekByte() !== 0) { const t = this.peekByte(); if (t === VT.Int8 || t === VT.Int16 || t === VT.Int32) this.value(); items.push(this.readPropsUntilZero()); } this.skip(1); return items; }
      case VT.Binary: { const n = this.u32(); this.skip(n); return "<binary>"; }
      case VT.Single: this.skip(4); return 0;
      case VT.Extended: this.skip(10); return 0;
      case VT.Double: case VT.Date: case VT.Currency: this.skip(8); return 0;
      case VT.Nil: return null;
      default: throw new DecodeError(`알 수 없는 DFM 값 종류 ${vt}`);
    }
  }

  /** TReader.ReadPrefix: 상위 니블이 0xF0이면 flag 바이트다. ffChildPos(2)면 정수 값 하나가 뒤따른다. */
  readPrefix(): void {
    if ((this.peekByte() & 0xf0) === 0xf0) {
      const flags = this.u8() & 0x0f;
      if (flags & 0x02) this.value(); // childPos
    }
  }

  private readAnsi(n: number, utf8: boolean): string {
    const slice = this.bytes.subarray(this.pos, this.pos + n);
    return utf8 ? new TextDecoder("utf-8").decode(slice) : this.ansiDecoder.decode(slice);
  }

  private readPropsUntilZero(): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    while (this.peekByte() !== 0) props[this.len8str()] = this.value();
    this.skip(1);
    return props;
  }

  readProps(): Record<string, unknown> {
    return this.readPropsUntilZero();
  }
}

export function shortCut(code: number): string {
  const mods: string[] = [];
  if (code & 0x4000) mods.push("Ctrl");
  if (code & 0x2000) mods.push("Shift");
  if (code & 0x8000) mods.push("Alt");
  return [...mods, vkName(code & 0xff)].join("+");
}

export interface DecodedDfm {
  className: string;
  title?: string;
  controls: FormControl[];
}

/** DFM 바이트 트리를 폼 문서로 바꾼다. */
export function decodeDfm(bytes: Uint8Array, ansi: TextDecoder): DecodedDfm {
  const r = new DfmReader(bytes, ansi);
  const sig = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
  if (sig !== "TPF0") throw new DecodeError(`TPF0 서명이 아닙니다: ${sig}`);
  const controls: FormControl[] = [];
  let rootTitle: string | undefined;
  let rootClass = "";

  function readObject(parent: string | undefined, depth: number): void {
    r.readPrefix();
    const className = r.len8str();
    const name = r.len8str();
    const props = r.readProps();
    const text = (props.Caption ?? props.Text ?? props.Hint) as string | undefined;
    const handlers: { event: string; method: string }[] = [];
    let shortcut: string | undefined;
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("On") && v && typeof v === "object" && "ident" in (v as object)) handlers.push({ event: k, method: (v as { ident: string }).ident });
      if (k === "ShortCut" && typeof v === "number" && v) shortcut = shortCut(v);
    }
    if (depth === 0) {
      rootClass = className;
      rootTitle = text;
    } else {
      const control: FormControl = { name, className, handlers };
      if (text !== undefined) control.text = text;
      if (shortcut) control.shortcut = shortcut;
      if (parent) control.parent = parent;
      controls.push(control);
    }
    while (r.peekByte() !== 0) readObject(name, depth + 1);
    r.skip(1); // 자식 목록 끝 0
  }

  readObject(undefined, 0);
  const doc: DecodedDfm = { className: rootClass, controls };
  if (rootTitle !== undefined) doc.title = rootTitle;
  return doc;
}

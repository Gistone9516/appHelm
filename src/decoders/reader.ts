// 리소스 바이트를 앞에서부터 읽는 작은 도구. 범위를 벗어나면 DecodeError를 던진다.

export class DecodeError extends Error {}

export class Reader {
  private readonly view: DataView;
  pos = 0;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  get eof(): boolean {
    return this.pos >= this.bytes.byteLength;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.byteLength) throw new DecodeError(`범위 초과: ${this.pos}+${n} > ${this.bytes.byteLength}`);
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  peekByte(at = this.pos): number {
    return this.bytes[at] ?? 0;
  }

  peekU16(at = this.pos): number {
    if (at + 2 > this.bytes.byteLength) throw new DecodeError(`범위 초과: ${at}`);
    return this.view.getUint16(at, true);
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }

  /** 버퍼 시작 기준 4바이트 경계로 맞춘다. 끝을 넘으면 끝에서 멈춘다. */
  align4(): void {
    this.pos = Math.min((this.pos + 3) & ~3, this.bytes.byteLength);
  }

  /** NUL로 끝나는 UTF-16LE 문자열 */
  utf16z(): string {
    let s = "";
    for (;;) {
      const c = this.u16();
      if (c === 0) return s;
      s += String.fromCharCode(c);
    }
  }

  /** 길이가 주어진 UTF-16LE 문자열 */
  utf16n(count: number): string {
    let s = "";
    for (let i = 0; i < count; i++) s += String.fromCharCode(this.u16());
    return s;
  }

  /** 대화상자의 sz_Or_Ord 필드: 없음 / 서수 / 문자열 */
  szOrOrd(): { ord: number } | { text: string } | null {
    const first = this.peekU16();
    if (first === 0x0000) {
      this.pos += 2;
      return null;
    }
    if (first === 0xffff) {
      this.pos += 2;
      return { ord: this.u16() };
    }
    return { text: this.utf16z() };
  }
}

/** 메뉴 글자에서 니모닉(&)을 지우고 탭 뒤 단축키를 분리한다. "저장(&S)\tCtrl+S" → { text: "저장", shortcut: "Ctrl+S" } */
export function splitMenuText(raw: string): { text: string; shortcut?: string } {
  const tab = raw.indexOf("\t");
  const label = tab >= 0 ? raw.slice(0, tab) : raw;
  const shortcut = tab >= 0 ? raw.slice(tab + 1).trim() : undefined;
  const text = label
    .replace(/\(&.\)/g, "")
    .replace(/&&/g, "\u0000")
    .replace(/&/g, "")
    .replace(/\u0000/g, "&")
    .trim();
  return shortcut ? { text, shortcut } : { text };
}

// 테스트용 리소스 바이트를 손으로 만드는 도구

export class Builder {
  private readonly parts: number[] = [];

  get length(): number {
    return this.parts.length;
  }

  u8(v: number): this {
    this.parts.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    return this.u8(v).u8(v >> 8);
  }

  u32(v: number): this {
    return this.u16(v & 0xffff).u16((v >>> 16) & 0xffff);
  }

  /** UTF-16LE + NUL */
  str(s: string): this {
    for (const ch of s) this.u16(ch.charCodeAt(0));
    return this.u16(0);
  }

  align4(): this {
    while (this.parts.length % 4) this.u8(0);
    return this;
  }

  setU16(at: number, v: number): this {
    this.parts[at] = v & 0xff;
    this.parts[at + 1] = (v >> 8) & 0xff;
    return this;
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

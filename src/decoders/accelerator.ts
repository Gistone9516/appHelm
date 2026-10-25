// RT_ACCELERATOR(9) 해석. 항목마다 8바이트, 마지막 항목은 0x80 플래그를 가진다.
import { Reader } from "./reader.ts";

export interface Accelerator {
  keys: string;
  commandId: number;
}

const FVIRTKEY = 0x01;
const FSHIFT = 0x04;
const FCONTROL = 0x08;
const FALT = 0x10;
const LAST = 0x80;

const VK_NAMES: Record<number, string> = {
  0x08: "Backspace", 0x09: "Tab", 0x0d: "Enter", 0x1b: "Esc", 0x20: "Space",
  0x21: "PgUp", 0x22: "PgDn", 0x23: "End", 0x24: "Home",
  0x25: "Left", 0x26: "Up", 0x27: "Right", 0x28: "Down",
  0x2d: "Ins", 0x2e: "Del",
  0x6a: "Num *", 0x6b: "Num +", 0x6d: "Num -", 0x6e: "Num .", 0x6f: "Num /",
  0xba: ";", 0xbb: "+", 0xbc: ",", 0xbd: "-", 0xbe: ".", 0xbf: "/", 0xc0: "`",
  0xdb: "[", 0xdc: "\\", 0xdd: "]", 0xde: "'",
};

export function vkName(vk: number): string {
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  if (vk >= 0x60 && vk <= 0x69) return `Num ${vk - 0x60}`;
  if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  return VK_NAMES[vk] ?? `VK_0x${vk.toString(16).toUpperCase()}`;
}

export function decodeAccelerators(bytes: Uint8Array): Accelerator[] {
  const r = new Reader(bytes);
  const out: Accelerator[] = [];
  while (r.pos + 8 <= r.length) {
    const flags = r.u16();
    const key = r.u16();
    const id = r.u16();
    r.u16(); // padding
    const mods: string[] = [];
    let name: string;
    if (flags & FVIRTKEY) {
      if (flags & FCONTROL) mods.push("Ctrl");
      if (flags & FSHIFT) mods.push("Shift");
      if (flags & FALT) mods.push("Alt");
      name = vkName(key);
    } else if (key >= 1 && key <= 26) {
      // 가상 키가 아닌 ASCII 제어 문자: 1 = Ctrl+A
      mods.push("Ctrl");
      name = String.fromCharCode(0x40 + key);
    } else {
      if (flags & FALT) mods.push("Alt");
      name = String.fromCharCode(key);
    }
    out.push({ keys: [...mods, name].join("+"), commandId: id });
    if (flags & LAST) break;
  }
  return out;
}

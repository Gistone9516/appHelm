// RT_MENU(4) 해석. 일반 MENU(버전 0)와 MENUEX(버전 1)를 모두 읽는다.
import type { MenuNode } from "../core/types.ts";
import { DecodeError, Reader, splitMenuText } from "./reader.ts";

const MF_POPUP = 0x10;
const MF_END = 0x80;
const MF_SEPARATOR = 0x800;
const MFT_SEPARATOR = 0x800;

export function decodeMenu(bytes: Uint8Array): MenuNode[] {
  const r = new Reader(bytes);
  const version = r.u16();
  const offset = r.u16();
  if (version === 0) {
    r.skip(offset);
    return readStandard(r);
  }
  if (version === 1) {
    r.pos = 4 + offset;
    return readEx(r);
  }
  throw new DecodeError(`알 수 없는 메뉴 버전 ${version}`);
}

function toNode(raw: string, commandId?: number): MenuNode {
  const { text, shortcut } = splitMenuText(raw);
  const node: MenuNode = { text };
  if (shortcut) node.shortcutText = shortcut;
  if (commandId !== undefined) node.commandId = commandId;
  return node;
}

function readStandard(r: Reader): MenuNode[] {
  const items: MenuNode[] = [];
  for (;;) {
    const flags = r.u16();
    if (flags & MF_POPUP) {
      const node = toNode(r.utf16z());
      node.children = readStandard(r);
      items.push(node);
    } else {
      const id = r.u16();
      const raw = r.utf16z();
      if ((flags & MF_SEPARATOR) || (id === 0 && raw === "")) items.push({ text: "", separator: true });
      else items.push(toNode(raw, id));
    }
    if (flags & MF_END) return items;
  }
}

function readEx(r: Reader): MenuNode[] {
  const items: MenuNode[] = [];
  for (;;) {
    const type = r.u32();
    r.u32(); // dwState
    const id = r.u32();
    const resInfo = r.u16();
    const raw = r.utf16z();
    r.align4();
    if (resInfo & 0x01) {
      r.u32(); // dwHelpId
      const node = toNode(raw);
      node.children = readEx(r);
      items.push(node);
    } else if (type & MFT_SEPARATOR) {
      items.push({ text: "", separator: true });
    } else {
      items.push(toNode(raw, id));
    }
    if (resInfo & MF_END) return items;
  }
}

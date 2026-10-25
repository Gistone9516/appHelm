// RT_DIALOG(5) 해석. DLGTEMPLATE과 DLGTEMPLATEEX를 모두 읽는다.
import { Reader } from "./reader.ts";

export interface DecodedDialog {
  title: string;
  controls: { id: number; className: string; text: string }[];
}

const DS_SETFONT = 0x40;

const CLASS_ORD: Record<number, string> = {
  0x80: "Button", 0x81: "Edit", 0x82: "Static", 0x83: "ListBox", 0x84: "ScrollBar", 0x85: "ComboBox",
};

function ordText(v: { ord: number } | { text: string } | null, isClass: boolean): string {
  if (v === null) return "";
  if ("text" in v) return v.text;
  return isClass ? CLASS_ORD[v.ord] ?? `#${v.ord}` : `#${v.ord}`;
}

export function decodeDialog(bytes: Uint8Array): DecodedDialog {
  const r = new Reader(bytes);
  const isEx = r.peekU16(0) === 1 && r.peekU16(2) === 0xffff;
  let style: number;
  let count: number;
  if (isEx) {
    r.skip(4); // dlgVer, signature
    r.u32(); // helpID
    r.u32(); // exStyle
    style = r.u32();
  } else {
    style = r.u32();
    r.u32(); // exStyle
  }
  count = r.u16();
  r.skip(8); // x, y, cx, cy
  r.szOrOrd(); // menu
  r.szOrOrd(); // class
  const title = r.utf16z();
  if (style & DS_SETFONT) {
    r.u16(); // point size
    if (isEx) {
      r.u16(); // weight
      r.u8(); // italic
      r.u8(); // charset
    }
    r.utf16z(); // typeface
  }

  const controls: DecodedDialog["controls"] = [];
  for (let i = 0; i < count; i++) {
    r.align4();
    let id: number;
    if (isEx) {
      r.u32(); // helpID
      r.u32(); // exStyle
      r.u32(); // style
      r.skip(8);
      id = r.u32();
    } else {
      r.u32(); // style
      r.u32(); // exStyle
      r.skip(8);
      id = r.u16();
    }
    const className = ordText(r.szOrOrd(), true);
    const text = ordText(r.szOrOrd(), false);
    const extra = r.u16();
    r.skip(extra);
    controls.push({ id: id === 0xffff || id === 0xffffffff ? -1 : id, className, text });
  }
  return { title, controls };
}

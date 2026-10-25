// 수집원 pe-resources: 메뉴·단축키·대화상자·문자열·버전 리소스 (IF-6, IF-7)
import { readFileSync } from "node:fs";
import type { Collector, CollectorContext, Evidence, Limitation, MenuNode, Target } from "../../core/types.ts";
import { decodeAccelerators } from "../../decoders/accelerator.ts";
import { decodeDialog } from "../../decoders/dialog.ts";
import { decodeMenu } from "../../decoders/menu.ts";
import { decodeStringBlock } from "../../decoders/stringtable.ts";
import { decodeVersionInfo } from "../../decoders/versioninfo.ts";
import { parsePe } from "../../pe/pe.ts";
import { readResources, type ResourceEntry } from "../../pe/resources.ts";

const ID = "pe-resources";
const RT = { MENU: 4, DIALOG: 5, STRING: 6, ACCELERATOR: 9, VERSION: 16 } as const;
const HANDLED = new Set<number>(Object.values(RT));
// 커서, 비트맵, 아이콘, 매니페스트, MUI 정보, 기업 데이터 보호 표지 등 조작과 무관한 종류
const IGNORED = new Set<number | string>([1, 2, 3, 11, 12, 14, 24, "MUI","EDPENLIGHTENEDAPPINFOID", "EDPPERMISSIVEAPPINFOID", "WEVT_TEMPLATE"]);
const UNHANDLED_HINTS: Record<string, string> = {
  UIFILE: "UIFILE은 리본 UI 정의입니다 (다음 사이클 대상).",
  "10": "RCDATA(10)는 Delphi 폼일 수 있습니다 (다음 사이클 대상).",
};
const MAX_STRINGS = 5000;

const LCID: Record<string, number> = { "ko-KR": 1042, "en-US": 1033, "ja-JP": 1041, "zh-CN": 2052, "zh-TW": 1028, "de-DE": 1031, "fr-FR": 1036 };

interface Picked extends ResourceEntry {
  file: string;
}

/** 같은 (type, name)이 여러 언어로 있으면 사용자 언어 → 중립(0) → 첫 번째 순으로 고른다. */
export function pickByLanguage(entries: ResourceEntry[], lcid: number | undefined): ResourceEntry[] {
  const groups = new Map<string, ResourceEntry[]>();
  for (const e of entries) {
    const k = `${e.type}|${e.name}`;
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }
  const out: ResourceEntry[] = [];
  for (const g of groups.values()) {
    out.push(g.find((e) => e.lang === lcid) ?? g.find((e) => e.lang === 0) ?? g[0]!);
  }
  return out;
}

function walkMenu(nodes: MenuNode[], path: string[], visit: (n: MenuNode, path: string[]) => void): void {
  for (const n of nodes) {
    if (n.separator) continue;
    const p = [...path, n.text];
    if (n.children) walkMenu(n.children, p, visit);
    else visit(n, p);
  }
}

function decodeOne(e: Picked, bytes: Uint8Array, evidence: Evidence[], stringCount: { n: number }): void {
  const loc = { file: e.file, resource: { type: e.type, name: e.name, ...(e.lang !== null ? { lang: e.lang } : {}) }, offset: e.offset };
  switch (e.type) {
    case RT.MENU: {
      const tree = decodeMenu(bytes);
      // 우클릭 메뉴처럼 최상위 팝업에 글자가 없으면 리소스 이름으로 부른다
      for (const top of tree) if (top.children && !top.text) top.text = `팝업 메뉴 ${e.name}`;
      walkMenu(tree, [], (n, path) => {
        evidence.push({
          id: `${ID}:menu-item:${e.name}:${path.join(">")}`,
          source: ID,
          kind: "menu-item",
          payload: { menuName: e.name, path, text: n.text, shortcutText: n.shortcutText, commandId: n.commandId },
          confidence: 0.9,
          locator: loc,
        });
      });
      return;
    }
    case RT.ACCELERATOR:
      for (const a of decodeAccelerators(bytes)) {
        evidence.push({
          id: `${ID}:accelerator:${e.name}:${a.keys}`,
          source: ID,
          kind: "accelerator",
          payload: { table: e.name, keys: a.keys, commandId: a.commandId },
          confidence: 0.9,
          locator: loc,
          invoke: [{ via: "shortcut", keys: a.keys }],
        });
      }
      return;
    case RT.DIALOG: {
      const d = decodeDialog(bytes);
      evidence.push({ id: `${ID}:dialog:${e.name}`, source: ID, kind: "dialog", payload: { name: e.name, ...d }, confidence: 0.9, locator: loc });
      return;
    }
    case RT.STRING:
      if (typeof e.name !== "number") return;
      for (const s of decodeStringBlock(bytes, e.name)) {
        if (stringCount.n++ >= MAX_STRINGS) return;
        evidence.push({ id: `${ID}:string:${s.id}`, source: ID, kind: "string", payload: { stringId: s.id, text: s.text }, confidence: 0.9, locator: loc });
      }
      return;
    case RT.VERSION:
      evidence.push({ id: `${ID}:version:${e.name}`, source: ID, kind: "version", payload: decodeVersionInfo(bytes), confidence: 0.9, locator: loc });
      return;
  }
}

export const peResources: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => !!t.pe,
  async collect(t: Target, ctx: CollectorContext) {
    const evidence: Evidence[] = [];
    const limitations: Limitation[] = [];
    const lcid = LCID[ctx.lang];
    const mui = t.muiPaths[0];
    const files = mui ? [mui, t.path] : [t.path];

    const cache = new Map<string, Uint8Array>();
    const picked: Picked[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      let entries: ResourceEntry[];
      try {
        const buf = new Uint8Array(readFileSync(file));
        cache.set(file, buf);
        entries = pickByLanguage(readResources(parsePe(buf)), lcid);
      } catch (err) {
        limitations.push({ code: "E_PARSE", collector: ID, message: `${file}: ${(err as Error).message}` });
        continue;
      }
      // MUI에 있는 리소스가 우선이고, exe에는 MUI에 없는 것만 쓴다
      for (const e of entries) {
        const k = `${e.type}|${e.name}`;
        if (seen.has(k)) continue;
        seen.add(k);
        picked.push({ ...e, file });
      }
    }
    if (!mui && t.pe) {
      limitations.push({ code: "E_MUI_NOT_FOUND", collector: ID, message: "MUI 파일이 없어 exe 안의 리소스만 읽었습니다." });
    }

    const unhandled = new Set<string>();
    const stringCount = { n: 0 };
    for (const e of picked) {
      if (typeof e.type !== "number" || !HANDLED.has(e.type)) {
        if (!IGNORED.has(e.type)) unhandled.add(String(e.type));
        continue;
      }
      const buf = cache.get(e.file)!; // 목록을 읽을 때 이미 넣어 두었다
      try {
        decodeOne(e, buf.subarray(e.offset, e.offset + e.bytes), evidence, stringCount);
      } catch (err) {
        limitations.push({ code: "E_PARSE", collector: ID, message: `리소스 ${e.type}/${e.name} 해석 실패: ${(err as Error).message}` });
      }
    }
    if (stringCount.n > MAX_STRINGS) {
      limitations.push({ code: "E_OUTPUT_TOO_LARGE", collector: ID, message: `문자열이 ${stringCount.n}개라 앞의 ${MAX_STRINGS}개만 담았습니다.` });
    }
    if (unhandled.size) {
      const hints = [...unhandled].map((t) => UNHANDLED_HINTS[t]).filter((h): h is string => !!h);
      limitations.push({
        code: "E_UNSUPPORTED_FORMAT",
        collector: ID,
        message: `해석하지 않은 리소스 종류: ${[...unhandled].join(", ")}`,
        ...(hints.length ? { hint: hints.join(" ") } : {}),
      });
    }
    return { evidence, limitations };
  },
};

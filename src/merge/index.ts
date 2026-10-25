// Evidence[] → OperationDoc. 같은 명령의 여러 출처를 하나의 작업으로 합친다 (IF-5, IF-9, IF-10).
import { knownCommandName, titleFromString } from "./knownIds.ts";
import type { DialogDoc, Evidence, InvokeHint, InvokeVia, Limitation, MenuNode, Operation, OperationDoc, Target } from "../core/types.ts";

export const INVOKE_ORDER: InvokeVia[] = ["com", "cli", "wm_command", "shortcut", "menu", "uia", "http", "shell"];

const rank = (v: InvokeVia) => INVOKE_ORDER.indexOf(v);

export function sortInvoke(hints: InvokeHint[]): InvokeHint[] {
  return [...hints].sort((a, b) => rank(a.via) - rank(b.via));
}

interface MenuItemPayload {
  menuName: number | string;
  path: string[];
  text: string;
  shortcutText?: string;
  commandId?: number;
}

/** 메뉴 항목 경로들로 메뉴 트리를 다시 만든다. 순서는 처음 나온 순서를 따른다. */
export function buildMenuTree(items: MenuItemPayload[]): MenuNode[] {
  const byMenu = new Map<string, MenuNode[]>();
  for (const it of items) {
    const key = String(it.menuName);
    let roots = byMenu.get(key);
    if (!roots) byMenu.set(key, (roots = []));
    let level = roots;
    it.path.forEach((seg, i) => {
      const last = i === it.path.length - 1;
      if (last) {
        const leaf: MenuNode = { text: it.text };
        if (it.shortcutText) leaf.shortcutText = it.shortcutText;
        if (it.commandId !== undefined) leaf.commandId = it.commandId;
        level.push(leaf);
        return;
      }
      let node = level.find((n) => n.text === seg && n.children);
      if (!node) level.push((node = { text: seg, children: [] }));
      level = node.children!;
    });
  }
  if (byMenu.size <= 1) return [...byMenu.values()][0] ?? [];
  // 주 메뉴(최상위 항목이 모두 이름 있는 팝업이고 항목이 가장 많은 것)는 최상위에, 나머지는 뒤에 붙인다
  const count = (ns: MenuNode[]): number => ns.reduce((s, n) => s + (n.children ? count(n.children) : 1), 0);
  const isMainLike = (roots: MenuNode[]) => roots.every((n) => n.children && n.text && !n.text.startsWith("팝업 메뉴"));
  const groups = [...byMenu.entries()];
  const main = groups.filter(([, r]) => isMainLike(r)).sort((a, b) => count(b[1]) - count(a[1]))[0];
  const out: MenuNode[] = main ? [...main[1]] : [];
  for (const [name, roots] of groups) {
    if (main && name === main[0]) continue;
    const named = roots.length === 1 && roots[0]!.children && roots[0]!.text.startsWith("팝업 메뉴");
    out.push(...(named ? roots : [{ text: `메뉴 리소스 ${name}`, children: roots }]));
  }
  return out;
}

interface AccelPayload {
  table: number | string;
  keys: string;
  commandId: number;
}

/** IF-15: 다른 표들과 어긋나는 연결을 가진 단축키 표(특정 모드용)를 찾는다. */
export function contextualTables(accels: AccelPayload[]): Set<string> {
  const support = new Map<string, Map<number, Set<string>>>(); // keys → commandId → 표 이름들
  for (const a of accels) {
    const byCmd = support.get(a.keys) ?? new Map<number, Set<string>>();
    const tables = byCmd.get(a.commandId) ?? new Set<string>();
    tables.add(String(a.table));
    byCmd.set(a.commandId, tables);
    support.set(a.keys, byCmd);
  }
  const out = new Set<string>();
  for (const byCmd of support.values()) {
    if (byCmd.size < 2) continue;
    const max = Math.max(...[...byCmd.values()].map((s) => s.size));
    const majority = [...byCmd.values()].filter((s) => s.size === max);
    if (majority.length !== 1) continue; // 동률이면 어느 쪽이 기본인지 알 수 없어 그대로 둔다
    for (const tables of byCmd.values()) {
      if (tables === majority[0]) continue;
      for (const t of tables) out.add(t);
    }
  }
  return out;
}

/** 명령 ID별 단축키 목록. 상황별 표에만 있는 단축키에는 context를 붙인다. */
export function shortcutsByCommand(accels: AccelPayload[]): Map<number, { keys: string; context?: string }[]> {
  const ctxTables = contextualTables(accels);
  const inBaseTable = new Set(accels.filter((a) => !ctxTables.has(String(a.table))).map((a) => `${a.keys}|${a.commandId}`));
  const out = new Map<number, { keys: string; context?: string }[]>();
  for (const a of accels) {
    const isBase = inBaseTable.has(`${a.keys}|${a.commandId}`);
    const item = isBase ? { keys: a.keys } : { keys: a.keys, context: String(a.table) };
    const list = out.get(a.commandId) ?? [];
    if (!list.some((x) => x.keys === item.keys && x.context === item.context)) {
      // 기본 단축키가 이미 있으면 같은 키의 상황별 항목은 넣지 않는다
      if (!(item.context && list.some((x) => x.keys === item.keys && !x.context))) list.push(item);
    }
    out.set(a.commandId, list);
  }
  return out;
}

export function merge(target: Target, evidence: Evidence[], limitations: Limitation[], provenance: OperationDoc["provenance"]): OperationDoc {
  const menuItems = evidence.filter((e) => e.kind === "menu-item").map((e) => e.payload as unknown as MenuItemPayload);
  const accels = evidence.filter((e) => e.kind === "accelerator").map((e) => e.payload as unknown as AccelPayload);
  const strings = new Map<number, string>();
  for (const e of evidence) if (e.kind === "string") strings.set(e.payload.stringId as number, e.payload.text as string);

  const ops = new Map<string, Operation>();
  const keysByCmd = shortcutsByCommand(accels);
  const shortcutHint = (k: { keys: string; context?: string }): InvokeHint =>
    k.context ? { via: "shortcut", keys: k.keys, context: k.context } : { via: "shortcut", keys: k.keys };

  const addHint = (op: Operation, h: InvokeHint) => {
    if (!op.invoke.some((x) => JSON.stringify(x) === JSON.stringify(h))) op.invoke.push(h);
  };

  for (const m of menuItems) {
    const key = m.commandId !== undefined ? `cmd:${m.commandId}` : `menu:${m.path.join(">")}`;
    let op = ops.get(key);
    if (!op) {
      op = { title: m.text, group: m.path[0], invoke: [], sources: ["pe-resources"], confidence: 0.9 };
      ops.set(key, op);
    }
    if (m.commandId !== undefined) addHint(op, { via: "wm_command", id: m.commandId });
    addHint(op, { via: "menu", path: m.path, ...(m.commandId !== undefined ? { commandId: m.commandId } : {}) });
    // IF-10: 단축키 표가 우선, 메뉴 글자 속 단축키는 표에 없을 때만
    const fromTable = m.commandId !== undefined ? keysByCmd.get(m.commandId) : undefined;
    if (fromTable) for (const k of fromTable) addHint(op, shortcutHint(k));
    else if (m.shortcutText) addHint(op, { via: "shortcut", keys: m.shortcutText });
  }

  for (const [cmd, keys] of keysByCmd) {
    if (ops.has(`cmd:${cmd}`)) continue;
    // 이름 출처 순서: 같은 ID의 리소스 문자열 → MFC 표준 ID → 번호
    const label = strings.get(cmd);
    const known = label ? null : knownCommandName(cmd);
    const op: Operation = {
      title: label ? titleFromString(label) : known?.title ?? `명령 #${cmd}`,
      group: "단축키 전용",
      invoke: [{ via: "wm_command", id: cmd }, ...keys.map(shortcutHint)],
      sources: ["pe-resources"],
      confidence: label ? 0.6 : known?.confidence ?? 0.4,
    };
    ops.set(`cmd:${cmd}`, op);
  }

  const operations = [...ops.values()].map((o) => ({ ...o, invoke: sortInvoke(o.invoke) }));
  const version = (evidence.find((e) => e.kind === "version")?.payload ?? {}) as Record<string, string>;
  const dialogs: DialogDoc[] = evidence
    .filter((e) => e.kind === "dialog")
    .map((e) => ({ name: e.payload.name as number | string, title: e.payload.title as string, controls: e.payload.controls as DialogDoc["controls"] }));
  const capabilities = evidence.filter((e) => e.kind === "import-capability").map((e) => e.payload.capability as string);
  const vias = new Set<InvokeVia>();
  for (const o of operations) for (const h of o.invoke) vias.add(h.via);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target,
    summary: {
      family: target.family,
      ...(version.ProductName ? { productName: version.ProductName } : {}),
      ...(version.FileDescription ? { fileDescription: version.FileDescription } : {}),
      howToOperate: INVOKE_ORDER.filter((v) => vias.has(v)),
      counts: {
        operations: operations.length,
        menuItems: menuItems.length,
        accelerators: accels.length,
        dialogs: dialogs.length,
        strings: strings.size,
        capabilities: capabilities.length,
      },
    },
    operations,
    ui: { menus: buildMenuTree(menuItems), dialogs },
    capabilities,
    version,
    limitations,
    provenance,
  };
}

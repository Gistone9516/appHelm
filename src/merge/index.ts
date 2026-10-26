// Evidence[] → OperationDoc. 같은 명령의 여러 출처를 하나의 작업으로 합친다 (IF-5, IF-9, IF-10).
import { knownCommandName, titleFromString } from "./knownIds.ts";
import type {
  AutomationDoc, CliDoc, ComServerDoc, DialogDoc, Evidence, FormDoc, InvokeHint, InvokeVia, Limitation, LiveUi, MenuNode, Operation, OperationDoc, PortDoc, Target, UiElement,
} from "../core/types.ts";

export const INVOKE_ORDER: InvokeVia[] = ["com", "cli", "wm_command", "shortcut", "menu", "uia", "http", "shell"];

const UIA_ACTION_PATTERNS = ["Invoke", "Toggle", "ExpandCollapse", "SelectionItem"];

/** UI 글자 비교용: 니모닉 "(&F)"·"(F)"와 탭 뒤 단축키, 끝의 "..."를 지운다. */
export function normalizeLabel(s: string): string {
  return s
    .split("\t")[0]!
    .replace(/\(&?[A-Za-z0-9]\)/g, "")
    .replace(/&/g, "")
    .replace(/(\.\.\.|…)$/, "")
    .trim()
    .toLowerCase();
}

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

/** 작업 묶음 이름. QML은 리소스 경로의 마지막 두 마디로 화면을 구분한다 (IF-36) */
function formGroup(f: FormDoc): string {
  if (f.framework === "delphi-vcl") return "Delphi 폼";
  if (f.framework === "qml") return `Qt 화면 ${(f.source ?? f.className).split("/").slice(-2).join("/")}`;
  return ".NET 폼";
}

/** IF-36: AutomationId의 `<형식>_QMLTYPE_<n>` 중 QML 폼이 있는 가장 깊은 형식을 단다 */
export function withQmlType(el: UiElement, forms: FormDoc[]): UiElement {
  if (!el.automationId || !el.automationId.includes("_QMLTYPE_")) return el;
  const known = new Set(forms.filter((f) => f.framework === "qml").map((f) => f.className));
  let found: string | undefined;
  for (const m of el.automationId.matchAll(/([A-Za-z_]\w*?)_QMLTYPE_\d+/g)) {
    const type = m[1]!.split(".").pop()!;
    if (known.has(type)) found = type;
  }
  return found ? { ...el, qmlType: found } : el;
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

  // IF-18: 셸 동사와 URL 프로토콜도 작업이다 (명령줄 템플릿으로 실행)
  const automation: AutomationDoc = { com: [], cli: [], protocols: [], ports: [] };
  // 같은 명령 템플릿은 하나로 묶는다 (메모장은 .txt·.bat·.cmd …가 같은 템플릿을 쓴다)
  const byTemplate = new Map<string, { verbs: Set<string>; whats: string[]; argv: string[]; invoke: InvokeHint[]; source: string; confidence: number }>();
  for (const e of evidence) {
    if (e.kind !== "shell-verb") continue;
    const p = e.payload as { progId: string; verb: string; template: string; extensions: string[]; argv: string[] };
    const key = p.template.toLowerCase();
    const g = byTemplate.get(key) ?? { verbs: new Set<string>(), whats: [], argv: p.argv, invoke: e.invoke ?? [], source: e.source, confidence: e.confidence };
    g.verbs.add(p.verb);
    for (const w of p.extensions.length ? p.extensions : [p.progId]) if (!g.whats.includes(w)) g.whats.push(w);
    byTemplate.set(key, g);
  }
  for (const [key, g] of byTemplate) {
    const template = evidence.find((e) => e.kind === "shell-verb" && (e.payload.template as string).toLowerCase() === key)!.payload.template as string;
    const whats = g.whats.length > 4 ? `${g.whats.slice(0, 4).join(", ")} 외 ${g.whats.length - 4}개` : g.whats.join(", ");
    const verbs = [...g.verbs].join("/");
    // JSON에는 전체 목록을 남긴다. 줄임은 작업 제목과 Markdown 표시에서만 한다
    automation.cli.push({ source: `${verbs}: ${g.whats.join(", ")}`, template, argv: g.argv });
    ops.set(`verb:${key}`, { title: `${verbs} (${whats})`, group: "셸 동사", invoke: g.invoke, sources: [g.source], confidence: g.confidence });
  }
  for (const e of evidence) {
    if (e.kind === "url-protocol") {
      const p = e.payload as { scheme: string; template: string; argv: string[] };
      automation.protocols.push({ scheme: p.scheme, template: p.template });
      ops.set(`url:${p.scheme}`, { title: `${p.scheme}: URL 열기`, group: "URL 프로토콜", invoke: e.invoke ?? [], sources: [e.source], confidence: e.confidence });
    } else if (e.kind === "cli-arg") {
      automation.cli.push(e.payload as unknown as CliDoc);
    } else if (e.kind === "com-server") {
      automation.com.push(e.payload as unknown as ComServerDoc);
    } else if (e.kind === "listen-port") {
      automation.ports.push(e.payload as unknown as PortDoc);
    }
  }

  const electronEv = evidence.find((e) => e.kind === "electron-app");
  const runtime = electronEv ? (electronEv.payload as Record<string, unknown>) : undefined;

  // IF-22, IF-23: 폼 컨트롤을 작업으로. WinForms는 컨트롤 이름이 UIA AutomationId와 같다
  const forms: FormDoc[] = [];
  for (const e of evidence) {
    if (e.kind !== "form") continue;
    const f = e.payload as unknown as FormDoc;
    forms.push(f);
    for (const c of f.controls) {
      if (!c.text && c.handlers.length === 0 && !c.shortcut) continue;
      const invoke: InvokeHint[] = [];
      if (c.shortcut) invoke.push({ via: "shortcut", keys: c.shortcut });
      // QML 컨트롤 이름은 UIA AutomationId가 아니다 (IF-36)
      if (c.name && f.framework !== "qml") invoke.push({ via: "uia", automationId: c.name, name: c.text ?? c.name, pattern: "Invoke" });
      ops.set(`form:${f.source ?? f.className}:${c.name}`, {
        title: c.text || c.name,
        group: formGroup(f),
        invoke,
        sources: [e.source],
        confidence: e.confidence,
      });
    }
  }

  // IF-20: 실행 중 UI 요소 이름이 작업 제목과 같으면 uia 힌트를 붙인다
  const liveEv = evidence.find((e) => e.kind === "ui-element");
  const liveRaw = liveEv ? (liveEv.payload as unknown as LiveUi) : undefined;
  const live = liveRaw ? { ...liveRaw, elements: liveRaw.elements.map((el) => withQmlType(el, forms)) } : undefined;
  if (live) {
    const byTitle = new Map<string, Operation>();
    for (const o of ops.values()) if (!byTitle.has(normalizeLabel(o.title))) byTitle.set(normalizeLabel(o.title), o);
    for (const el of live.elements) {
      const pattern = el.patterns.find((p) => UIA_ACTION_PATTERNS.includes(p));
      if (!pattern || !el.name) continue;
      const op = byTitle.get(normalizeLabel(el.name));
      if (!op) continue;
      addHint(op, { via: "uia", name: el.name, pattern, ...(el.automationId ? { automationId: el.automationId } : {}) });
      if (!op.sources.includes(liveEv!.source)) op.sources.push(liveEv!.source);
    }
  }

  const operations = [...ops.values()].map((o) => ({ ...o, invoke: sortInvoke(o.invoke) }));
  const comMembers = automation.com.reduce((s, c) => s + c.interfaces.reduce((a, i) => a + i.members.length, 0), 0);
  const version = (evidence.find((e) => e.kind === "version")?.payload ?? {}) as Record<string, string>;
  const dialogs: DialogDoc[] = evidence
    .filter((e) => e.kind === "dialog")
    .map((e) => ({ name: e.payload.name as number | string, title: e.payload.title as string, controls: e.payload.controls as DialogDoc["controls"] }));
  const capabilities = evidence.filter((e) => e.kind === "import-capability").map((e) => e.payload.capability as string);
  const vias = new Set<InvokeVia>();
  for (const o of operations) for (const h of o.invoke) vias.add(h.via);
  if (comMembers > 0) vias.add("com");

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
        comServers: automation.com.length,
        comMembers,
        cliTemplates: automation.cli.length,
        protocols: automation.protocols.length,
        ports: automation.ports.length,
        uiElements: live?.elements.length ?? 0,
        forms: forms.length,
        formControls: forms.reduce((s, f) => s + f.controls.length, 0),
      },
    },
    operations,
    ui: { menus: buildMenuTree(menuItems), dialogs, forms, ...(live ? { live } : {}) },
    automation,
    ...(runtime ? { runtime } : {}),
    capabilities,
    version,
    limitations,
    provenance,
  };
}

// QML 원문에서 단축키와 라벨을 뽑는다 (IF-36). 코드를 실행하지 않고 글자만 본다.

export const QML_LIMITS = { maxLabels: 40, maxHandlerChars: 120 };

/** Qt StandardKey의 Windows 키. 표에 없는 것은 버린다 (Windows에서 키가 없는 Quit, Preferences 등) */
export const STANDARD_KEYS_WINDOWS: Record<string, string> = {
  New: "Ctrl+N", Open: "Ctrl+O", Save: "Ctrl+S", Close: "Ctrl+F4", Print: "Ctrl+P",
  Undo: "Ctrl+Z", Redo: "Ctrl+Y", Cut: "Ctrl+X", Copy: "Ctrl+C", Paste: "Ctrl+V", Delete: "Del",
  SelectAll: "Ctrl+A", Find: "Ctrl+F", FindNext: "F3", FindPrevious: "Shift+F3", Replace: "Ctrl+H",
  Refresh: "F5", HelpContents: "F1", ZoomIn: "Ctrl++", ZoomOut: "Ctrl+-",
  Bold: "Ctrl+B", Italic: "Ctrl+I", Underline: "Ctrl+U", Back: "Alt+Left", Forward: "Alt+Right",
  NextChild: "Ctrl+Tab", PreviousChild: "Ctrl+Shift+Tab", AddTab: "Ctrl+T", Cancel: "Esc",
};

export interface QmlShortcut {
  keys: string;
  /** onActivated의 첫 줄 */
  handler: string;
}

export interface QmlInfo {
  shortcuts: QmlShortcut[];
  labels: string[];
}

function keysOf(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/StandardKey\.(\w+)|"([^"]+)"/g)) {
    if (m[1]) {
      const k = STANDARD_KEYS_WINDOWS[m[1]];
      if (k) out.push(k);
    } else if (m[2]) {
      out.push(m[2].replace(/\bMeta\b/g, "Win"));
    }
  }
  return out;
}

/** 여는 중괄호 위치부터 짝이 맞는 닫는 중괄호까지 (문자열 안 괄호는 무시) */
function blockAt(text: string, open: number): string {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

export function readQml(text: string): QmlInfo {
  const shortcuts: QmlShortcut[] = [];
  for (const m of text.matchAll(/\bShortcut\s*\{/g)) {
    const body = blockAt(text, m.index! + m[0].length - 1);
    const seq = /\bsequences?\s*:\s*([^\n]+)/.exec(body);
    const act = /\bonActivated\s*:\s*([^\n]+)/.exec(body);
    if (!seq) continue;
    let handler = (act?.[1] ?? "").trim();
    if (handler.startsWith("{")) {
      const inner = blockAt(body, act!.index + act![0].indexOf("{"));
      handler = inner.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("//")) ?? "";
    }
    handler = handler.replace(/;$/, "").slice(0, QML_LIMITS.maxHandlerChars);
    for (const keys of keysOf(seq[1]!)) shortcuts.push({ keys, handler });
  }
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\bqsTr\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const label = m[1]!.replace(/\\(.)/g, "$1");
    if (!label.trim() || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= QML_LIMITS.maxLabels) break;
  }
  return { shortcuts, labels };
}

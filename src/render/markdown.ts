// OperationDoc → AI가 먼저 읽는 Markdown 요약. 4KB를 넘지 않는다 (IF-13).
import type { ComInterfaceDoc, ComServerDoc, InvokeVia, Operation, OperationDoc } from "../core/types.ts";

export const MAX_MD_BYTES = 4096;

const VIA_LABEL: Record<InvokeVia, string> = {
  com: "COM 자동화",
  cli: "명령줄 인자",
  wm_command: "WM_COMMAND (명령 ID를 창에 보냄)",
  shortcut: "단축키",
  menu: "메뉴 클릭",
  uia: "UI Automation",
  http: "HTTP",
  shell: "셸 동사",
};

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const cell = (s: string) => s.replace(/\|/g, "\\|");

function opRow(o: Operation): string {
  // IF-15: 상황별 표의 단축키는 요약에 넣지 않는다
  const keys = o.invoke
    .filter((h): h is Extract<typeof h, { via: "shortcut" }> => h.via === "shortcut" && !h.context)
    .map((h) => h.keys)
    .join(", ");
  const cmd = o.invoke.find((h) => h.via === "wm_command") as { id: number } | undefined;
  return `| ${cell(o.group ?? "")} | ${cell(o.title)} | ${cell(keys)} | ${cmd ? cmd.id : ""} |`;
}

/** IF-17: 서버 CLSID와 GUID가 같은 coclass의 기본 인터페이스 */
export function defaultInterface(c: ComServerDoc): ComInterfaceDoc | undefined {
  const cls = c.interfaces.find((i) => i.kind === "coclass" && i.guid?.toUpperCase() === c.clsid.toUpperCase());
  const name = cls?.implements?.[0];
  return name ? c.interfaces.find((i) => i.name === name && i.kind !== "coclass" && i.members.length > 0) : undefined;
}

/** 자동화 창구 요약. 항목마다 개수를 제한해 표가 들어갈 자리를 남긴다 (IF-13). */
export function automationLines(doc: OperationDoc): string[] {
  const a = doc.automation;
  const lines: string[] = [];
  const named = a.com.filter((c) => c.interfaces.length > 0 || c.progId);
  for (const c of named.slice(0, 3)) {
    const ifaces = [...c.interfaces].filter((i) => i.members.length).sort((x, y) => y.members.length - x.members.length);
    const total = ifaces.reduce((s, i) => s + i.members.length, 0);
    const main = defaultInterface(c);
    const names = [...new Set((main ? [main] : ifaces).flatMap((i) => i.members.map((m) => m.name)))].slice(0, 12);
    const id = c.progId ?? c.clsid;
    const sample = names.length ? ` (${main ? `기본 인터페이스 ${main.name}` : "예"}: ${names.join(", ")})` : "";
    lines.push(`- COM \`${id}\`: 인터페이스 ${ifaces.length}개, 멤버 ${total}개${sample}`);
    if (c.progId && c.server === "local") lines.push(`  - PowerShell: \`$o = New-Object -ComObject ${c.progId}\``);
  }
  if (named.length > 3) lines.push(`- COM 서버 ${named.length - 3}개 더 (JSON automation.com)`);
  const short = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
  for (const c of a.cli.slice(0, 4)) lines.push(`- 명령줄 (${short(c.source)}): \`${c.template}\``);
  if (a.cli.length > 4) lines.push(`- 명령줄 ${a.cli.length - 4}개 더 (JSON automation.cli)`);
  if (a.protocols.length) lines.push(`- URL 프로토콜: ${a.protocols.slice(0, 6).map((p) => `\`${p.scheme}:\``).join(", ")}`);
  if (a.ports.length) lines.push(`- 열린 TCP 포트: ${a.ports.slice(0, 6).map((p) => `${p.address}:${p.port}`).join(", ")} (연결은 확인하지 않음)`);
  const live = doc.ui.live;
  if (live) lines.push(`- 실행 중 화면: 창 ${live.windows.map((w) => `"${w}"`).slice(0, 3).join(", ")}, 요소 ${live.elements.length}개${live.truncated ? " (일부)" : ""} (JSON ui.live)`);
  return lines.length ? ["", "## 자동화 창구", ...lines] : [];
}

export function renderMarkdown(doc: OperationDoc, jsonPath: string): string {
  const t = doc.target;
  const name = doc.summary.fileDescription ?? doc.summary.productName ?? t.path.split("\\").pop();
  const head: string[] = [
    `# 조작 문서: ${name}`,
    "",
    `- 경로: \`${t.path}\``,
    `- 종류: ${t.family}${doc.version.FileVersion ? ` · 버전 ${doc.version.FileVersion}` : ""}`,
    `- 조작 방법 (우선순위): ${doc.summary.howToOperate.map((v) => VIA_LABEL[v]).join(" → ") || "찾지 못함"}`,
  ];
  if (doc.summary.howToOperate.includes("wm_command")) {
    head.push("- 명령 ID는 프로그램 창에 WM_COMMAND(wParam=ID)로 보내면 해당 메뉴를 누른 것과 같습니다.");
  }

  head.push(...automationLines(doc));

  const tail: string[] = [];
  if (doc.capabilities.length) tail.push("", "## 할 수 있는 일 (import 기반 추정)", doc.capabilities.join(", "));
  if (doc.limitations.length) {
    tail.push("", "## 한계");
    for (const l of doc.limitations.slice(0, 6)) tail.push(`- ${l.message}${l.hint ? ` (${l.hint})` : ""}`);
    if (doc.limitations.length > 6) tail.push(`- 외 ${doc.limitations.length - 6}건은 JSON에 있습니다.`);
  }
  tail.push("", `전체 내용 (모든 작업, 메뉴 트리, 대화상자): \`${jsonPath}\``);

  const tableHead = ["", `## 작업`, "", "| 메뉴 | 작업 | 단축키 | 명령 ID |", "|---|---|---|---|"];
  const budget = MAX_MD_BYTES - bytes([...head, ...tableHead, ...tail].join("\n")) - 120;
  const rows: string[] = [];
  let used = 0;
  for (const o of doc.operations) {
    const row = opRow(o);
    if (used + bytes(row) + 1 > budget) break;
    rows.push(row);
    used += bytes(row) + 1;
  }
  tableHead[1] = `## 작업 (${doc.operations.length}개 중 ${rows.length}개 표시)`;
  return [...head, ...tableHead, ...rows, ...tail].join("\n") + "\n";
}

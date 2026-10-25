// OperationDoc → AI가 먼저 읽는 Markdown 요약. 4KB를 넘지 않는다 (IF-13).
import type { InvokeVia, Operation, OperationDoc } from "../core/types.ts";

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

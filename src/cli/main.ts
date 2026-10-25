// rea-adapter map <대상> : 조작 문서를 만들어 파일로 저장하고 Markdown 요약을 출력한다.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { mapProgram } from "../core/pipeline.ts";
import type { CollectorContext } from "../core/types.ts";
import type { OperationDoc } from "../core/types.ts";
import { merge } from "../merge/index.ts";
import { createProbe } from "../probe/index.ts";
import { createReaRunner } from "../rea-bridge/runner.ts";
import { renderMarkdown } from "../render/markdown.ts";
import { ALL_COLLECTORS } from "./collectors.ts";
import { runInvoke } from "./invoke.ts";
import { runServe } from "./serve.ts";
import { remoteMap } from "../transport/client.ts";

const USAGE = `사용법: rea-adapter <명령> ...

명령:
  map <exe 경로 또는 이름>   조작 문서를 만든다
  invoke-com                 COM 메서드/속성을 실행한다
  invoke-window              실행 중인 창에 명령/키를 보낸다
  invoke-http                발견한 로컬 포트로 요청을 보낸다
  serve                      이 PC를 에이전트로 띄운다 (원격 조작용)

map 옵션:
  --out <폴더>       결과를 저장할 폴더 (기본: ./rea-adapter-out)
  --lang <언어>      리소스 언어 (기본: 시스템 언어, 예: ko-KR)
  --timeout <ms>     REA 한 번 실행의 제한 시간 (기본: 180000)
  --live             실행 중인 프로그램의 화면 요소(UI Automation)를 읽음
  --allow-launch     대상 프로그램을 실행하는 수집 허용 (아직 해당 수집 없음)
  --host <이름|IP>   원격 노드의 에이전트로 보낸다 (Tailscale)
  --quiet            진행 로그를 숨김

invoke-com 옵션:
  --progid <ProgID>  예: Word.Application
  --attach           이미 떠 있는 인스턴스에 붙는다
  --path <경로>      예: Selection.TypeText (속성 경로 + 끝 메서드/속성)
  --text <문자열>    문자열 인자 하나 (TypeText 등, 따옴표 걱정 없음)
  --args <JSON배열>  메서드 인자 여러 개
  --set <JSON값>     속성 설정 값
  --host <이름|IP>   원격 노드에서 실행

invoke-window 옵션:
  --target <exe 경로>  대상 실행 파일
  --wm <명령ID>        WM_COMMAND로 메뉴 명령 실행
  --keys <키>          SendKeys 형식 (예: ^s = Ctrl+S)
  --host <이름|IP>     원격 노드에서 실행

invoke-uia 옵션:
  --target <exe 경로|이름>  대상 실행 파일 경로 또는 프로세스 이름(WINWORD.EXE)
  --name <글자>        버튼/요소 이름 (부분 일치)
  --automation-id <id> AutomationId로 지정
  --control-type <형>  예: Button
  --pattern <패턴>     Invoke(기본)|Toggle|Expand|Collapse|Select|Value
  --value <값>         pattern=Value일 때 설정 값
  --list               실행 대신 일치 요소 목록을 보여줌 (이름 확인용)
  --host <이름|IP>     원격 노드에서 실행`;

const NOTICE = "[REA Adapter] 본인이 소유하거나 분석을 허가받은 프로그램에만 사용하세요 (저작권법 제101조의4: 호환 목적의 역분석만 허용).";

interface Args {
  target?: string;
  out: string;
  lang: string;
  timeoutMs: number;
  live: boolean;
  launch: boolean;
  quiet: boolean;
  host?: string;
}

function parseArgs(argv: string[]): Args | string {
  const [cmd, ...rest] = argv;
  if (cmd !== "map") return USAGE;
  const a: Args = { out: "rea-adapter-out", lang: Intl.DateTimeFormat().resolvedOptions().locale || "en-US", timeoutMs: 180000, live: false, launch: false, quiet: false };
  for (let i = 0; i < rest.length; i++) {
    const v = rest[i]!;
    if (v === "--out") a.out = rest[++i] ?? a.out;
    else if (v === "--lang") a.lang = rest[++i] ?? a.lang;
    else if (v === "--timeout") a.timeoutMs = Number(rest[++i] ?? a.timeoutMs);
    else if (v === "--host") a.host = rest[++i];
    else if (v === "--live") a.live = true;
    else if (v === "--allow-launch") a.launch = true;
    else if (v === "--quiet") a.quiet = true;
    else if (v.startsWith("--")) return `알 수 없는 옵션: ${v}\n\n${USAGE}`;
    else a.target = v;
  }
  if (!a.target) return USAGE;
  return a;
}

function showNoticeOnce(): void {
  const dir = join(process.env.LOCALAPPDATA ?? tmpdir(), "rea-adapter");
  const marker = join(dir, "notice-v1");
  if (existsSync(marker)) return;
  process.stderr.write(NOTICE + "\n");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(marker, new Date().toISOString());
  } catch {
    // 표시만 하고 기록 실패는 무시한다
  }
}

export async function runMap(rest: string[]): Promise<number> {
  const args = parseArgs(["map", ...rest]);
  if (typeof args === "string") {
    process.stderr.write(args + "\n");
    return 2;
  }
  const log = (m: string) => {
    if (!args.quiet) process.stderr.write(`· ${m}\n`);
  };
  const workDir = join(tmpdir(), "rea-adapter");
  mkdirSync(workDir, { recursive: true });
  // 원격 노드로 위임
  if (args.host) {
    const res = await remoteMap(args.host, args.target!, { live: args.live, lang: args.lang });
    if (!res.ok) {
      process.stderr.write(`원격 오류: ${res.error}\n`);
      return 1;
    }
    writeDoc(res.doc, args.out, log);
    return 0;
  }
  const ctx: CollectorContext = {
    allow: { live: args.live, launch: args.launch },
    timeoutMs: args.timeoutMs,
    workDir,
    lang: args.lang,
    rea: createReaRunner({ workDir, timeoutMs: args.timeoutMs, log }),
    log,
  };
  const result = await mapProgram(args.target!, ctx, { probe: createProbe(args.lang), collectors: ALL_COLLECTORS, merge });
  if ("error" in result) {
    for (const l of result.error) process.stderr.write(`오류: ${l.message}${l.hint ? ` (${l.hint})` : ""}\n`);
    return 1;
  }
  writeDoc(result, args.out, log);
  return 0;
}

function writeDoc(result: OperationDoc, out: string, log: (m: string) => void): void {
  const outDir = resolve(out);
  mkdirSync(outDir, { recursive: true });
  const stem = basename(result.target.path).replace(/\.[^.]+$/, "");
  const jsonPath = join(outDir, `${stem}.ops.json`);
  const mdPath = join(outDir, `${stem}.ops.md`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
  const md = renderMarkdown(result, jsonPath);
  writeFileSync(mdPath, md, "utf8");
  process.stdout.write(md);
  log(`저장: ${mdPath}`);
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  showNoticeOnce();
  switch (cmd) {
    case "map":
      return runMap(rest);
    case "invoke-com":
    case "invoke-window":
    case "invoke-uia":
    case "invoke-http":
      return runInvoke(cmd, rest);
    case "serve":
      return runServe(rest);
    default:
      process.stderr.write(USAGE + "\n");
      return cmd ? 2 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`예기치 않은 오류: ${(e as Error).stack ?? e}\n`);
    process.exit(1);
  },
);

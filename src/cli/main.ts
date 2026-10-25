// rea-adapter map <대상> : 조작 문서를 만들어 파일로 저장하고 Markdown 요약을 출력한다.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { mapProgram } from "../core/pipeline.ts";
import type { CollectorContext } from "../core/types.ts";
import { peImports } from "../collectors/pe-imports/index.ts";
import { peResources } from "../collectors/pe-resources/index.ts";
import { merge } from "../merge/index.ts";
import { createProbe } from "../probe/index.ts";
import { createReaRunner } from "../rea-bridge/runner.ts";
import { renderMarkdown } from "../render/markdown.ts";

const USAGE = `사용법: rea-adapter map <exe 경로 또는 이름> [옵션]

옵션:
  --out <폴더>       결과를 저장할 폴더 (기본: ./rea-adapter-out)
  --lang <언어>      리소스 언어 (기본: 시스템 언어, 예: ko-KR)
  --timeout <ms>     REA 한 번 실행의 제한 시간 (기본: 180000)
  --live             실행 중인 프로그램에 붙는 수집 허용 (2차 사이클)
  --allow-launch     대상 프로그램을 실행하는 수집 허용 (2차 사이클)
  --quiet            진행 로그를 숨김`;

const NOTICE = "[REA Adapter] 본인이 소유하거나 분석을 허가받은 프로그램에만 사용하세요 (저작권법 제101조의4: 호환 목적의 역분석만 허용).";

interface Args {
  target?: string;
  out: string;
  lang: string;
  timeoutMs: number;
  live: boolean;
  launch: boolean;
  quiet: boolean;
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === "string") {
    process.stderr.write(args + "\n");
    return 2;
  }
  showNoticeOnce();
  const log = (m: string) => {
    if (!args.quiet) process.stderr.write(`· ${m}\n`);
  };
  const workDir = join(tmpdir(), "rea-adapter");
  mkdirSync(workDir, { recursive: true });
  const ctx: CollectorContext = {
    allow: { live: args.live, launch: args.launch },
    timeoutMs: args.timeoutMs,
    workDir,
    lang: args.lang,
    rea: createReaRunner({ workDir, timeoutMs: args.timeoutMs, log }),
    log,
  };
  const result = await mapProgram(args.target!, ctx, { probe: createProbe(args.lang), collectors: [peResources, peImports], merge });
  if ("error" in result) {
    for (const l of result.error) process.stderr.write(`오류: ${l.message}${l.hint ? ` (${l.hint})` : ""}\n`);
    return 1;
  }
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const stem = basename(result.target.path).replace(/\.[^.]+$/, "");
  const jsonPath = join(outDir, `${stem}.ops.json`);
  const mdPath = join(outDir, `${stem}.ops.md`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
  const md = renderMarkdown(result, jsonPath);
  writeFileSync(mdPath, md, "utf8");
  process.stdout.write(md);
  log(`저장: ${mdPath}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`예기치 않은 오류: ${(e as Error).stack ?? e}\n`);
    process.exit(1);
  },
);

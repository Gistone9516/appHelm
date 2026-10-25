// apphelm commands build|find : Office 계열 앱의 명령 목록 만들기와 찾기 (IF-32).
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enumerateControls, loadCatalog, saveCatalog, scanIdentifiers, searchCatalog, validateMso, type CatalogEntry, type StepRunner } from "../catalog/index.ts";
import { invoke, type ComStepResult } from "../invoke/index.ts";
import { remoteInvoke } from "../transport/client.ts";

function opt(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
function opts(rest: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) if (rest[i] === name && rest[i + 1]) out.push(rest[++i]!);
  return out;
}

/** progId에 붙어(attach) 단계를 실행하는 실행기. host가 있으면 원격 에이전트로 보낸다. */
export function stepRunner(progId: string, host?: string): StepRunner {
  return async (steps, o) => {
    const action = { kind: "com" as const, progId, attach: true, steps: steps as never, ...(o.continueOnError ? { continueOnError: true } : {}) };
    if (host) {
      const r = await remoteInvoke(host, action, o.timeoutSec * 1000);
      if (!r.ok) return { ok: false, error: r.error };
      const detail = (r.result as { detail?: { steps?: ComStepResult[] } }).detail;
      if (detail?.steps) return { ok: true, steps: detail.steps };
      return { ok: false, error: r.result.ok ? "단계 결과가 없습니다" : r.result.limitation.message };
    }
    const workDir = join(tmpdir(), "apphelm");
    mkdirSync(workDir, { recursive: true });
    const r = await invoke(action, { workDir, timeoutMs: o.timeoutSec * 1000 });
    if (r.ok) return { ok: true, steps: r.detail.steps as ComStepResult[] };
    return { ok: false, error: r.limitation.message };
  };
}

export async function runCommands(rest: string[]): Promise<number> {
  const [sub, ...args] = rest;
  if (sub === "find") {
    const [progId, ...q] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--limit");
    const c = progId ? loadCatalog(progId) : null;
    if (!c || !q.length) {
      process.stderr.write("commands find <ProgID> <찾을 말> (먼저 commands build)\n");
      return 2;
    }
    const r = searchCatalog(c, q.join(" "), Number(opt(args, "--limit") ?? 60));
    process.stdout.write(r.lines.join("\n") + `\n(${r.lines.length}/${r.total})\n`);
    return 0;
  }
  if (sub !== "build") {
    process.stderr.write("commands build --progid <ProgID> [--host H] [--scan <바이너리>]... [--names <후보 파일>]\ncommands find <ProgID> <찾을 말>\n");
    return 2;
  }
  const progId = opt(args, "--progid");
  if (!progId) {
    process.stderr.write("--progid가 필요합니다 (예: Word.Application)\n");
    return 2;
  }
  const host = opt(args, "--host");
  const run = stepRunner(progId, host);
  const log = (m: string) => process.stderr.write(m + "\n");

  log("예전 메뉴 체계 컨트롤을 읽는 중 (몇 분 걸릴 수 있음)...");
  const controls = await enumerateControls(run);
  if (typeof controls === "string") {
    log(`컨트롤 읽기 실패: ${controls}`);
    return 1;
  }
  log(`컨트롤 ${controls.length}개`);

  const names: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => {
    if (!seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  };
  for (const f of opts(args, "--names")) for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const n = line.split("\t").at(-1)!.trim();
    if (/^[A-Za-z][A-Za-z0-9_]{1,59}$/.test(n)) add(n);
  }
  for (const f of opts(args, "--scan")) for (const n of scanIdentifiers(new Uint8Array(readFileSync(f)))) add(n);
  log(`리본 이름 후보 ${names.length}개 확인 중...`);
  const mso: CatalogEntry[] = await validateMso(run, names, 700, (d, v) => log(`  ${d}/${names.length} 확인, 유효 ${v}`));
  const path = saveCatalog({ progId, ...(host ? { host } : {}), builtAt: new Date().toISOString(), entries: [...mso, ...controls] });
  process.stdout.write(`리본 명령 ${mso.length}개 + 컨트롤 ${controls.length}개\n저장: ${path}\n`);
  return 0;
}

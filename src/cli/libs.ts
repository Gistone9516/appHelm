// apphelm ls / pull / typelib / ref : 원격 프로그램 파일 받기(IF-30)와 타입 라이브러리 덤프·찾기(IF-31).
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { remoteFile, remoteList } from "../transport/client.ts";
import { dumpTypelib, listTypelibs, loadTypelib, searchTypelib } from "../typelib/index.ts";

function opt(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

export async function runLs(rest: string[]): Promise<number> {
  const host = opt(rest, "--host");
  const path = opt(rest, "--path");
  if (!host || !path) {
    process.stderr.write("ls에는 --host와 --path가 필요합니다.\n");
    return 2;
  }
  const r = await remoteList(host, path);
  if (!r.ok) {
    process.stderr.write(`원격 오류: ${r.error}\n`);
    return 1;
  }
  for (const it of r.data.items) process.stdout.write(it.dir ? `${it.name}\\\n` : `${it.name}\t${it.size ?? ""}\n`);
  return 0;
}

export async function runPull(rest: string[]): Promise<number> {
  const host = opt(rest, "--host");
  const out = resolve(opt(rest, "--out") ?? "apphelm-pull");
  const paths: string[] = [];
  for (let i = 0; i < rest.length; i++) if (rest[i] === "--path" && rest[i + 1]) paths.push(rest[++i]!);
  if (!host || paths.length === 0) {
    process.stderr.write("pull에는 --host와 --path(여러 번 가능)가 필요합니다.\n");
    return 2;
  }
  let failed = 0;
  for (const p of paths) {
    const dest = join(out, basename(p.replace(/\\/g, "/")));
    const r = await remoteFile(host, p, dest);
    if (r.ok) process.stdout.write(`받음: ${dest} (${r.bytes} bytes, sha256 ${r.sha256.slice(0, 16)}…)\n`);
    else {
      failed++;
      process.stderr.write(`실패: ${p}: ${r.error}\n`);
    }
  }
  return failed ? 1 : 0;
}

export async function runTypelib(rest: string[]): Promise<number> {
  const file = rest.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write(`typelib <파일(.olb/.tlb/.dll/.exe)>\n저장된 라이브러리: ${listTypelibs().join(", ") || "(없음)"}\n`);
    return 2;
  }
  const workDir = join(tmpdir(), "apphelm");
  mkdirSync(workDir, { recursive: true });
  const r = await dumpTypelib(resolve(file), { workDir, timeoutMs: 600000 });
  if (!r.ok) {
    process.stderr.write(`실패: ${r.limitation.message}\n`);
    return 1;
  }
  const kinds = new Map<string, number>();
  for (const t of r.dump.types) kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);
  process.stdout.write(`${r.dump.name}: 형식 ${r.dump.types.length}개 (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}), 멤버 ${r.dump.memberCount}개${r.dump.truncated ? " (잘림)" : ""}\n저장: ${r.path}\n`);
  return 0;
}

export async function runRef(rest: string[]): Promise<number> {
  const [lib, ...q] = rest.filter((a) => !a.startsWith("--"));
  const dump = lib ? loadTypelib(lib) : null;
  if (!dump || q.length === 0) {
    process.stderr.write(`ref <라이브러리> <찾을 말>\n저장된 라이브러리: ${listTypelibs().join(", ") || "(없음)"}\n`);
    return 2;
  }
  const r = searchTypelib(dump, q.join(" "), Number(opt(rest, "--limit") ?? 150));
  process.stdout.write(r.lines.join("\n") + `\n(${r.lines.length}/${r.total}줄)\n`);
  return 0;
}

// IF-31: 타입 라이브러리 전체 덤프와 찾아보기. AI에게는 전체가 아니라 찾은 부분만 한 줄 서명으로 준다.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Limitation } from "../core/types.ts";
import { runPsScript } from "../ps/runner.ts";

export interface TlParam {
  name: string;
  type: string;
  opt?: boolean;
  def?: unknown;
  out?: boolean;
}
export interface TlMember {
  name: string;
  kind: "method" | "get" | "put" | "putref" | "const" | "prop";
  id?: number;
  params?: TlParam[];
  returns?: string;
  value?: unknown;
  doc?: string;
  hidden?: boolean;
  readonly?: boolean;
}
export interface TlType {
  name: string;
  kind: "dispatch" | "interface" | "coclass" | "enum" | "alias" | "module" | "record" | "other";
  doc?: string;
  hidden?: boolean;
  aliasOf?: string;
  implements?: { name: string; default?: boolean; events?: boolean }[];
  members: TlMember[];
}
export interface TypeLibDump {
  file: string;
  name: string;
  doc?: string;
  memberCount: number;
  truncated: boolean;
  types: TlType[];
}

export function typelibDir(): string {
  return join(process.env.LOCALAPPDATA ?? tmpdir(), "apphelm", "typelibs");
}

/** 파일의 타입 라이브러리를 덤프해 캐시에 저장한다. 저장 이름은 라이브러리 이름(예: Word). */
export async function dumpTypelib(file: string, opts: { workDir: string; timeoutMs: number }): Promise<{ ok: true; dump: TypeLibDump; path: string } | { ok: false; limitation: Limitation }> {
  const r = await runPsScript<TypeLibDump>("typelib.ps1", { file, maxMembers: 200000 }, { workDir: opts.workDir, timeoutMs: opts.timeoutMs, collector: "com-typelib" });
  if (!r.ok) return r;
  const dir = typelibDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${safeName(r.data.name || basename(file))}.json`);
  writeFileSync(path, JSON.stringify(r.data), "utf8");
  return { ok: true, dump: r.data, path };
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9_.-]/g, "_");
}

export function listTypelibs(): string[] {
  const dir = typelibDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export function loadTypelib(name: string): TypeLibDump | null {
  const path = join(typelibDir(), `${safeName(name)}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as TypeLibDump;
}

function fmtDef(v: unknown): string {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function fmtParams(ps: TlParam[] | undefined): string {
  return (ps ?? []).map((p) => `${p.out ? "out " : ""}${p.name}${p.opt ? "?" : ""}: ${p.type}${p.def !== undefined ? ` = ${fmtDef(p.def)}` : ""}`).join(", ");
}

/** 형식 하나의 멤버를 한 줄 서명으로. 같은 이름의 get/put은 한 줄로 합친다. */
export function formatMembers(t: TlType): string[] {
  const out: string[] = [];
  const props = new Map<string, { get?: TlMember; put?: TlMember }>();
  for (const m of t.members) {
    if (m.kind === "get" || m.kind === "put" || m.kind === "putref") {
      const e = props.get(m.name) ?? {};
      if (m.kind === "get") e.get = m;
      else e.put = e.put ?? m;
      props.set(m.name, e);
    }
  }
  const done = new Set<string>();
  for (const m of t.members) {
    const hid = m.hidden ? " [hidden]" : "";
    if (m.kind === "method") out.push(`${t.name}.${m.name}(${fmtParams(m.params)}) -> ${m.returns ?? "void"}${hid}`);
    else if (m.kind === "const") out.push(`${t.name}.${m.name} = ${fmtDef(m.value)}`);
    else if (m.kind === "prop") out.push(`${t.name}.${m.name}: ${m.returns ?? "Variant"} (${m.readonly ? "get" : "get/put"})${hid}`);
    else {
      if (done.has(m.name)) continue;
      done.add(m.name);
      const e = props.get(m.name)!;
      const g = e.get;
      const rw = g && e.put ? "get/put" : g ? "get" : "put";
      const ps = g?.params?.length ? `(${fmtParams(g.params)})` : "";
      const type = g?.returns ?? e.put?.params?.at(-1)?.type ?? "Variant";
      out.push(`${t.name}.${m.name}${ps}: ${type} (${rw})${hid}`);
    }
  }
  return out;
}

/** coclass는 기본 인터페이스의 멤버를 보여 준다 (Application → _Application). */
function resolveType(lib: TypeLibDump, t: TlType): TlType {
  if (t.kind !== "coclass") return t;
  const def = t.implements?.find((i) => i.default && !i.events) ?? t.implements?.find((i) => !i.events);
  const target = def && lib.types.find((x) => x.name === def.name);
  return target ? { ...target, name: t.name } : t;
}

/**
 * 찾기 규칙: "형식"이면 그 형식의 멤버 전부, "형식.멤버"면 그 멤버, 아니면 형식 이름과 "형식.멤버" 이름의 부분 문자열.
 * 결과는 limit 줄에서 자른다.
 */
export function searchTypelib(lib: TypeLibDump, query: string, limit = 150): { lines: string[]; total: number } {
  const q = query.trim().toLowerCase();
  const byName = new Map(lib.types.map((t) => [t.name.toLowerCase(), t]));
  const dot = q.indexOf(".");
  let lines: string[] = [];
  const exact = byName.get(q);
  if (exact) {
    const t = resolveType(lib, exact);
    const head = `# ${exact.name} (${exact.kind}${t !== exact ? ` -> ${t.kind}` : ""})${exact.doc ? ` - ${exact.doc}` : ""}`;
    lines = [head, ...formatMembers(t)];
  } else if (dot > 0 && byName.has(q.slice(0, dot))) {
    const t = resolveType(lib, byName.get(q.slice(0, dot))!);
    const mq = q.slice(dot + 1);
    lines = formatMembers(t).filter((l) => l.toLowerCase().slice(t.name.length + 1).startsWith(mq));
  } else {
    for (const t0 of lib.types) {
      // coclass 멤버는 기본 인터페이스와 같으므로 머리줄만 낸다 (중복 방지)
      if (t0.name.toLowerCase().includes(q)) lines.push(`# ${t0.name} (${t0.kind}, 멤버 ${resolveType(lib, t0).members.length}개)`);
      if (t0.kind === "coclass") continue;
      for (const l of formatMembers(t0)) {
        const name = l.slice(0, l.search(/[(:= ]/));
        if (name.toLowerCase().includes(q)) lines.push(l);
      }
    }
  }
  return { lines: lines.slice(0, limit), total: lines.length };
}

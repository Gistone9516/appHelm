// IF-32: Office 계열 앱의 명령 목록. 실행 중인 앱에서 직접 확인한 것만 담는다.
//  - control: 예전 메뉴 체계(CommandBars) 컨트롤. FindControl(, Id).Execute로 실행한다.
//  - mso: 리본 명령 이름(idMso). GetLabelMso로 확인된 것만, ExecuteMso로 실행한다.
// 후보 이름은 실행 파일 안의 UTF-16 식별자 문자열에서 뽑고(scanIdentifiers), 앱이 확인해 준 것만 남긴다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CatalogEntry {
  kind: "control" | "mso";
  id: string | number;
  label: string;
  bar?: string;
  controlType?: number;
}

export interface CommandCatalog {
  progId: string;
  host?: string;
  builtAt: string;
  entries: CatalogEntry[];
}

/** COM 단계 실행기: 로컬 invoke나 원격 remoteInvoke를 감싼 것 (catalog는 transport를 import하지 않는다). */
export type StepRunner = (steps: unknown[], opts: { continueOnError: boolean; timeoutSec: number }) => Promise<{ ok: true; steps: { i: number; ok: boolean; result?: unknown; error?: string }[] } | { ok: false; error: string }>;

export function catalogDir(): string {
  return join(process.env.LOCALAPPDATA ?? tmpdir(), "apphelm", "commands");
}

export function catalogPath(progId: string): string {
  return join(catalogDir(), `${progId.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`);
}

export function loadCatalog(progId: string): CommandCatalog | null {
  const p = catalogPath(progId);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as CommandCatalog) : null;
}

export function saveCatalog(c: CommandCatalog): string {
  mkdirSync(catalogDir(), { recursive: true });
  const p = catalogPath(c.progId);
  writeFileSync(p, JSON.stringify(c), "utf8");
  return p;
}

/** 바이너리에서 PascalCase UTF-16LE 식별자(3~60자, 소문자 포함)를 뽑는다. 순서는 처음 나온 순서. */
export function scanIdentifiers(buf: Uint8Array, min = 3, max = 60): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = "";
  const flush = () => {
    if (cur.length >= min && cur.length <= max && /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(cur) && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
    }
    cur = "";
  };
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const c = buf[i]! | (buf[i + 1]! << 8);
    const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (ok) cur += String.fromCharCode(c);
    else flush();
  }
  flush();
  return out;
}

/** 예전 메뉴 체계 컨트롤 전부 (Office 공통 CommandBars.FindControls). 원소당 수십 ms라 시간이 걸린다. */
export async function enumerateControls(run: StepRunner): Promise<CatalogEntry[] | string> {
  const r = await run([{ path: "CommandBars.FindControls()", each: { props: ["Id", "Caption", "Type", "Parent.Name"], max: 20000 } }], { continueOnError: false, timeoutSec: 1800 });
  if (!r.ok) return r.error;
  const res = r.steps[0]?.result as { rows?: Record<string, unknown>[] } | undefined;
  return controlsFromRows(res?.rows ?? []);
}

/** FindControls 행(Id, Caption, Type, Parent.Name) → 중복 없는 control 항목. 단축키 표시(&)는 뺀다. */
export function controlsFromRows(rows: Record<string, unknown>[]): CatalogEntry[] {
  const byKey = new Map<string, CatalogEntry>();
  for (const row of rows) {
    const id = row.Id;
    const caption = String(row.Caption ?? "");
    if (typeof id !== "number" || id <= 0 || !caption || caption.startsWith("!")) continue;
    const label = caption.replace(/\(&.\)|&/g, "").replace(/​/g, "").trim();
    const key = `${id}|${label}`;
    if (!byKey.has(key)) byKey.set(key, { kind: "control", id, label, bar: String(row["Parent.Name"] ?? ""), controlType: Number(row.Type) });
  }
  return [...byKey.values()];
}

/** 후보 이름을 GetLabelMso로 확인한다. 실패한 이름은 리본 명령이 아니다. */
export async function validateMso(run: StepRunner, names: string[], chunk = 700, onProgress?: (done: number, valid: number) => void): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = [];
  for (let s = 0; s < names.length; s += chunk) {
    const part = names.slice(s, s + chunk);
    const r = await run(part.map((n) => ({ path: `CommandBars.GetLabelMso("${n}")` })), { continueOnError: true, timeoutSec: 900 });
    if (r.ok) {
      for (const st of r.steps) {
        if (st.ok && typeof st.result === "string") out.push({ kind: "mso", id: part[st.i]!, label: st.result.replace(/​/g, "").trim() });
      }
    }
    onProgress?.(Math.min(s + chunk, names.length), out.length);
  }
  return out;
}

/** 실행 방법: invoke_operation의 COM 단계 하나. */
export function invokeStepOf(e: CatalogEntry): { path: string } {
  return e.kind === "mso" ? { path: `CommandBars.ExecuteMso("${e.id}")` } : { path: `CommandBars.FindControl(missing, ${e.id}).Execute` };
}

/** 한국어 이름, 영어 이름, ID에서 부분 문자열로 찾는다. 리본 명령(mso)을 앞에 둔다. */
export function searchCatalog(c: CommandCatalog, query: string, limit = 60): { lines: string[]; total: number } {
  const q = query.trim().toLowerCase();
  const hits = c.entries.filter((e) => e.label.toLowerCase().includes(q) || String(e.id).toLowerCase().includes(q));
  hits.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "mso" ? -1 : 1));
  const lines = hits.map((e) => `${e.label}\t${e.kind === "mso" ? `idMso ${e.id}` : `control ${e.id}${e.bar ? ` (${e.bar})` : ""}`}\t${invokeStepOf(e).path}`);
  return { lines: lines.slice(0, limit), total: lines.length };
}

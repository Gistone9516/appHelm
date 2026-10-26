// 대상 판별: 사용자가 넘긴 경로나 이름을 Target으로 바꾼다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { TOOLKITS } from "../core/toolkits.ts";
import type { Limitation, Target, TargetFamily, ToolkitInfo } from "../core/types.ts";
import { findMuiPaths } from "../pe/mui.ts";
import { parsePe, readImports } from "../pe/pe.ts";

const err = (code: Limitation["code"], message: string, hint?: string): Limitation => ({ code, collector: "pipeline", message, ...(hint ? { hint } : {}) });

/** "notepad"처럼 경로 없이 이름만 주면 PATH와 Windows 폴더에서 찾는다. */
export function resolveExecutable(input: string): string | null {
  if (existsSync(input)) return resolve(input);
  if (isAbsolute(input) || input.includes("\\") || input.includes("/")) return null;
  const names = /\.[a-z0-9]+$/i.test(input) ? [input] : [input + ".exe", input];
  const dirs = [...(process.env.PATH ?? "").split(delimiter), process.env.SystemRoot ?? "C:\\Windows", join(process.env.SystemRoot ?? "C:\\Windows", "System32")];
  // 이름 순서가 바깥 고리다: Git Bash의 PATH 앞쪽에 있는 확장자 없는 셸 스크립트(usr\bin\notepad)보다 .exe가 먼저다
  for (const n of names) {
    for (const d of dirs) {
      if (!d) continue;
      const p = join(d, n);
      try {
        if (existsSync(p) && statSync(p).isFile()) return p;
      } catch {
        // 접근할 수 없는 PATH 항목은 건너뛴다
      }
    }
  }
  return null;
}

const DVCLAL = Buffer.from("DVCLAL", "utf16le");

/** DVCLAL 리소스 이름은 Delphi/C++Builder 실행 파일의 표지다. */
export function hasDelphiMarker(bytes: Buffer): boolean {
  return bytes.indexOf(DVCLAL) >= 0;
}

/** IF-24: exe 폴더 또는 바로 아래 하위 폴더(최신)의 resources\app(.asar). */
export function findElectron(exePath: string): Target["electron"] {
  const base = dirname(exePath);
  const candidates = [base];
  try {
    const subs = readdirSync(base)
      .map((d) => join(base, d))
      .filter((p) => {
        try {
          return statSync(p).isDirectory() && existsSync(join(p, "resources"));
        } catch {
          return false;
        }
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    candidates.push(...subs);
  } catch {
    // 폴더를 못 읽으면 base만 본다
  }
  for (const root of candidates) {
    const resources = join(root, "resources");
    const asar = join(resources, "app.asar");
    const appDir = join(resources, "app");
    if (existsSync(asar)) return { resourcesDir: resources, asar };
    if (existsSync(join(appDir, "package.json"))) return { resourcesDir: resources, appDir };
  }
  return undefined;
}

const DEEP_MAX_DEPTH = 3;
const DEEP_MAX_DIRS = 2000;

/** 폴더 아래 깊이 3까지 너비 우선으로 훑어 찾고 싶은 파일 이름(소문자)의 첫 위치를 돌려준다 (IF-35). */
function findDeep(base: string, names: Set<string>): Map<string, string> {
  const found = new Map<string, string>();
  const queue: { dir: string; depth: number }[] = [{ dir: base, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < DEEP_MAX_DIRS && found.size < names.size) {
    const { dir, depth } = queue.shift()!;
    visited++;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const lower = e.name.toLowerCase();
      if (e.isDirectory()) {
        if (depth < DEEP_MAX_DEPTH) queue.push({ dir: join(dir, e.name), depth: depth + 1 });
      } else if (depth > 0 && names.has(lower) && !found.has(lower)) {
        found.set(lower, join(dir, e.name));
      }
    }
  }
  return found;
}

/** IF-35: import DLL 이름, exe 폴더의 파일, deep 툴킷은 하위 폴더까지 보고 표의 툴킷을 모두 고른다. */
export function findToolkits(exePath: string, importedDlls: string[]): ToolkitInfo[] {
  const base = dirname(exePath);
  const imports = new Set(importedDlls.map((d) => d.toLowerCase()));
  let siblings = new Set<string>();
  try {
    siblings = new Set(readdirSync(base).map((n) => n.toLowerCase()));
  } catch {
    // 폴더를 못 읽으면 import만 본다
  }
  const deepNames = new Set<string>();
  for (const t of TOOLKITS) if (t.deep) for (const f of t.files) if (!imports.has(f) && !siblings.has(f)) deepNames.add(f);
  const deep = deepNames.size ? findDeep(base, deepNames) : new Map<string, string>();
  const out: ToolkitInfo[] = [];
  for (const t of TOOLKITS) {
    const evidence: string[] = [];
    for (const f of t.files) {
      if (imports.has(f)) evidence.push(`import ${f}`);
      else if (siblings.has(f)) evidence.push(`exe 폴더에 ${f}`);
      else if (t.deep && deep.has(f)) evidence.push(`하위 폴더에 ${relative(base, deep.get(f)!)}`);
    }
    if (evidence.length) out.push({ id: t.id, code: t.code, name: t.name, evidence });
  }
  // import로 확인된 툴킷을 앞에 둔다
  return out.sort((a, b) => Number(b.evidence.some((e) => e.startsWith("import "))) - Number(a.evidence.some((e) => e.startsWith("import "))));
}

export function createProbe(lang: string) {
  return async function probe(input: string): Promise<{ target: Target | null; limitations: Limitation[] }> {
    const path = resolveExecutable(input);
    if (!path) return { target: null, limitations: [err("E_NOT_APPLICABLE", `대상을 찾지 못했습니다: ${input}`, "exe의 전체 경로를 넘겨 보세요.")] };
    if (statSync(path).isDirectory()) {
      return { target: null, limitations: [err("E_UNSUPPORTED_FORMAT", "폴더 대상은 아직 지원하지 않습니다 (3차 사이클).", "폴더 안의 주 실행 파일(.exe)을 넘겨 주세요.")] };
    }
    const bytes = readFileSync(path);
    let pe;
    try {
      pe = parsePe(new Uint8Array(bytes));
    } catch (e) {
      return { target: null, limitations: [err("E_UNSUPPORTED_FORMAT", `PE 실행 파일이 아닙니다: ${(e as Error).message}`)] };
    }
    const familyEvidence: string[] = [];
    let family: TargetFamily = "native";
    const electron = findElectron(path);
    if (pe.info.isDotNet) {
      family = "dotnet";
      familyEvidence.push("CLR 데이터 디렉터리가 있음");
    } else if (electron) {
      family = "electron";
      familyEvidence.push(`${electron.asar ? "resources\\app.asar" : "resources\\app"}가 있음`);
    } else if (hasDelphiMarker(bytes)) {
      family = "delphi";
      familyEvidence.push("DVCLAL 리소스 표지가 있음 (Delphi/C++Builder)");
    } else {
      familyEvidence.push("CLR·Electron·Delphi 표지 없음 → 네이티브로 판단");
    }
    let importedDlls: string[] = [];
    try {
      importedDlls = readImports(pe).map((d) => d.dll);
    } catch {
      // import 표가 깨져 있으면 폴더 표지만 본다
    }
    const toolkits = findToolkits(path, importedDlls);
    const target: Target = {
      input,
      kind: "file",
      path,
      family,
      familyEvidence,
      pe: pe.info,
      muiPaths: findMuiPaths(path, lang),
      ...(electron ? { electron } : {}),
      ...(toolkits.length ? { toolkits } : {}),
    };
    return { target, limitations: [] };
  };
}

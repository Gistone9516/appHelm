// 대상 판별: 사용자가 넘긴 경로나 이름을 Target으로 바꾼다.
import { existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import type { Limitation, Target, TargetFamily } from "../core/types.ts";
import { findMuiPaths } from "../pe/mui.ts";
import { parsePe } from "../pe/pe.ts";

const err = (code: Limitation["code"], message: string, hint?: string): Limitation => ({ code, collector: "pipeline", message, ...(hint ? { hint } : {}) });

/** "notepad"처럼 경로 없이 이름만 주면 PATH와 Windows 폴더에서 찾는다. */
export function resolveExecutable(input: string): string | null {
  if (existsSync(input)) return resolve(input);
  if (isAbsolute(input) || input.includes("\\") || input.includes("/")) return null;
  const names = /\.[a-z0-9]+$/i.test(input) ? [input] : [input + ".exe", input];
  const dirs = [...(process.env.PATH ?? "").split(delimiter), process.env.SystemRoot ?? "C:\\Windows", join(process.env.SystemRoot ?? "C:\\Windows", "System32")];
  for (const d of dirs) {
    if (!d) continue;
    for (const n of names) {
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

export function createProbe(lang: string) {
  return async function probe(input: string): Promise<{ target: Target | null; limitations: Limitation[] }> {
    const path = resolveExecutable(input);
    if (!path) return { target: null, limitations: [err("E_NOT_APPLICABLE", `대상을 찾지 못했습니다: ${input}`, "exe의 전체 경로를 넘겨 보세요.")] };
    if (statSync(path).isDirectory()) {
      return { target: null, limitations: [err("E_UNSUPPORTED_FORMAT", "폴더 대상은 아직 지원하지 않습니다 (3차 사이클).", "폴더 안의 주 실행 파일(.exe)을 넘겨 주세요.")] };
    }
    let pe;
    try {
      pe = parsePe(new Uint8Array(readFileSync(path)));
    } catch (e) {
      return { target: null, limitations: [err("E_UNSUPPORTED_FORMAT", `PE 실행 파일이 아닙니다: ${(e as Error).message}`)] };
    }
    const familyEvidence: string[] = [];
    let family: TargetFamily = "native";
    if (pe.info.isDotNet) {
      family = "dotnet";
      familyEvidence.push("CLR 데이터 디렉터리가 있음");
    } else if (existsSync(join(dirname(path), "resources", "app.asar"))) {
      family = "electron";
      familyEvidence.push("resources\\app.asar가 있음");
    } else {
      familyEvidence.push("CLR·Electron 표지 없음 → 네이티브로 판단");
    }
    const target: Target = {
      input,
      kind: "file",
      path,
      family,
      familyEvidence,
      pe: pe.info,
      muiPaths: findMuiPaths(path, lang),
    };
    return { target, limitations: [] };
  };
}

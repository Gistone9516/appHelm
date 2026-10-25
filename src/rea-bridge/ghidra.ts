// Ghidra/JDK 위치 감지와 REA에 넘길 환경 변수. (5차 native-trace 전용, 옵트인)
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface GhidraConfig {
  ghidraDir: string;
  javaHome: string;
}

const DEFAULTS = {
  ghidra: ["C:\\tools\\ghidra_12.1.4_PUBLIC"],
  jdk: ["C:\\tools\\jdk-21"],
};

// REA 의미를 따른다: 환경 변수가 설정돼 있으면 그 경로만 보고(틀려도 폴백 안 함),
// 설정이 없을 때만 기본 설치 경로를 탐색한다.
function resolveOne(envVal: string | undefined, defaults: string[], marker: string): string | null {
  const cands = envVal ? [envVal] : defaults;
  for (const c of cands) {
    if (existsSync(join(c, marker))) return c;
  }
  return null;
}

/** Ghidra와 JDK를 찾는다. 둘 다 있어야 설정을 돌려준다. */
export function detectGhidra(env: NodeJS.ProcessEnv = process.env): GhidraConfig | null {
  const ghidraDir = resolveOne(env.GHIDRA_INSTALL_DIR, DEFAULTS.ghidra, "support\\analyzeHeadless.bat");
  const javaHome = resolveOne(env.JAVA_HOME, DEFAULTS.jdk, "bin\\java.exe");
  if (!ghidraDir || !javaHome) return null;
  return { ghidraDir, javaHome };
}

/** REA 자식 프로세스에 주입할 Ghidra 환경 변수. */
export function ghidraEnv(cfg: GhidraConfig, startupTimeoutMs = 900000): Record<string, string> {
  return {
    GHIDRA_INSTALL_DIR: cfg.ghidraDir,
    JAVA_HOME: cfg.javaHome,
    REA_ANALYSIS_PROVIDER: "ghidra",
    REA_GHIDRA_STARTUP_TIMEOUT_MS: String(startupTimeoutMs),
    PATH: `${join(cfg.javaHome, "bin")};${process.env.PATH ?? ""}`,
  };
}

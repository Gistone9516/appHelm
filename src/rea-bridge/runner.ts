// REA CLI를 자식 프로세스로 실행한다 (IF-11, IF-12).
import { spawn } from "node:child_process";
import { createWriteStream, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Limitation, ReaRunner } from "../core/types.ts";

export const REA_VERSION = "6.7.0";
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** cmd.exe /s /c 에 넘길 한 줄. 인자는 모두 큰따옴표로 감싼다 (경로에 공백이 있어도 안전). */
export function buildCommandLine(command: string, args: string[], version = REA_VERSION): string {
  const quoted = args.map((a) => {
    if (a.includes('"')) throw new Error(`인자에 큰따옴표를 쓸 수 없습니다: ${a}`);
    return `"${a}"`;
  });
  return `"npx -y rea-agents@${version} ${command} ${quoted.join(" ")} --json"`;
}

/** REA가 돌려준 JSON이 오류 보고인지 판정한다. */
export function reaErrorOf(json: unknown): string | null {
  if (json && typeof json === "object" && "code" in json && "message" in json && !("normalized_result" in json)) {
    const j = json as { code: unknown; message: unknown };
    return `${String(j.code)}: ${String(j.message)}`;
  }
  return null;
}

export interface RunnerOptions {
  workDir: string;
  timeoutMs: number;
  version?: string;
  log?: (msg: string) => void;
  env?: Record<string, string>; // REA 자식 프로세스에 추가로 넣을 환경 변수 (Ghidra 등)
}

export function createReaRunner(opts: RunnerOptions): ReaRunner {
  let seq = 0;
  const fail = (code: Limitation["code"], message: string, hint?: string) =>
    ({ ok: false as const, limitation: { code, collector: "rea-bridge", message, ...(hint ? { hint } : {}) } });

  return {
    run(command, args) {
      const outFile = join(opts.workDir, `rea-${process.pid}-${++seq}-${command}.json`);
      const line = buildCommandLine(command, args, opts.version);
      opts.log?.(`REA 실행: ${command} ${args.join(" ")}`);
      return new Promise((resolve) => {
        const child = spawn("cmd.exe", ["/d", "/s", "/c", line], { windowsVerbatimArguments: true, windowsHide: true, env: opts.env ? { ...process.env, ...opts.env } : process.env });
        const ws = createWriteStream(outFile);
        child.stdout.pipe(ws);
        let stderr = "";
        child.stderr.on("data", (d: Buffer) => {
          if (stderr.length < 4000) stderr += d.toString("utf8");
        });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          if (child.pid) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
        }, opts.timeoutMs);
        child.on("error", (e) => {
          clearTimeout(timer);
          resolve(fail("E_REA_UNAVAILABLE", `REA를 실행하지 못했습니다: ${e.message}`, "Node.js와 npm이 설치되어 있는지 확인하세요."));
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          ws.end(() => {
            if (timedOut) return resolve(fail("E_TIMEOUT", `REA ${command}가 ${opts.timeoutMs}ms 안에 끝나지 않았습니다.`));
            let size = 0;
            try {
              size = statSync(outFile).size;
            } catch {
              size = 0;
            }
            if (size > MAX_OUTPUT_BYTES) return resolve(fail("E_OUTPUT_TOO_LARGE", `REA 출력이 ${size}바이트라 건너뛰었습니다.`));
            if (size === 0) {
              return resolve(fail("E_REA_UNAVAILABLE", `REA ${command}가 출력 없이 끝났습니다 (종료 코드 ${code}).`, stderr.slice(0, 300) || undefined));
            }
            let json: unknown;
            try {
              json = JSON.parse(readFileSync(outFile, "utf8").replace(/^﻿/, ""));
            } catch (e) {
              return resolve(fail("E_PARSE", `REA 출력을 JSON으로 읽지 못했습니다: ${(e as Error).message}`));
            }
            try {
              rmSync(outFile, { force: true });
            } catch {
              // 읽기는 끝났으니 지우지 못해도 결과에는 영향이 없다
            }
            const err = reaErrorOf(json);
            if (err) return resolve(fail("E_UNSUPPORTED_FORMAT", `REA가 거부했습니다: ${err}`));
            resolve({ ok: true, json });
          });
        });
      });
    },
  };
}

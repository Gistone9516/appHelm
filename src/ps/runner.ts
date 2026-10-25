// IF-21: PowerShell 5.1 스크립트 실행. 작업 폴더에 스크립트와 i.json을 두고, 스크립트가 o.json을 쓴다.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CollectorId, Limitation } from "../core/types.ts";

/** PowerShell 5.1 JSON은 원소 1개 배열을 값으로, 빈 배열을 null로 내보낼 수 있다 (F-11). 경계에서 항상 배열로 맞춘다. */
export function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (Array.isArray(v)) return v;
  return v === null || v === undefined ? [] : [v];
}

export type PsResult<T> = { ok: true; data: T } | { ok: false; limitation: Limitation };

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "scripts");
let seq = 0;

export interface PsJob {
  dir: string;
  script: string;
  output: string;
}

/** 작업 폴더를 만들고 스크립트(s.ps1)와 입력(i.json)을 복사한다. 경로가 짧고 공백이 없어야 예약 작업에도 쓸 수 있다. */
export function prepareJob(name: string, params: unknown, workDir: string): PsJob {
  const dir = join(workDir, `j${process.pid}-${++seq}`);
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "s.ps1");
  copyFileSync(join(SCRIPTS, name), script);
  writeFileSync(join(dir, "i.json"), JSON.stringify(params), "utf8");
  return { dir, script, output: join(dir, "o.json") };
}

/** 결과를 읽은 뒤 작업 폴더를 지운다. 지우지 못해도 결과에는 영향이 없다. */
export function readJobOutputAndClean<T>(job: PsJob, collector: CollectorId): PsResult<T> {
  const r = readJobOutput<T>(job, collector);
  try {
    rmSync(job.dir, { recursive: true, force: true });
  } catch {
    // 다른 프로세스가 아직 잡고 있으면 남겨 둔다
  }
  return r;
}

function readJobOutput<T>(job: PsJob, collector: CollectorId): PsResult<T> {
  if (!existsSync(job.output)) {
    return { ok: false, limitation: { code: "E_PS_FAILED", collector, message: "PowerShell 스크립트가 결과를 남기지 않았습니다." } };
  }
  try {
    const data = JSON.parse(readFileSync(job.output, "utf8").replace(/^﻿/, "")) as T & { error?: string };
    if (data && typeof data === "object" && typeof data.error === "string") {
      return { ok: false, limitation: { code: "E_PS_FAILED", collector, message: `PowerShell 오류: ${data.error}` } };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, limitation: { code: "E_PARSE", collector, message: `PowerShell 결과를 읽지 못했습니다: ${(e as Error).message}` } };
  }
}

export function psArgs(script: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script];
}

/** 현재 세션에서 바로 실행한다. */
export function runPsScript<T>(name: string, params: unknown, opts: { workDir: string; timeoutMs: number; collector: CollectorId }): Promise<PsResult<T>> {
  const job = prepareJob(name, params, opts.workDir);
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", psArgs(job.script), { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 2000) stderr += d.toString("utf8");
    });
    const timer = setTimeout(() => {
      if (child.pid) spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      resolve({ ok: false, limitation: { code: "E_TIMEOUT", collector: opts.collector, message: `PowerShell ${name}가 ${opts.timeoutMs}ms 안에 끝나지 않았습니다.` } });
    }, opts.timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, limitation: { code: "E_PS_FAILED", collector: opts.collector, message: `PowerShell을 실행하지 못했습니다: ${e.message}` } });
    });
    child.on("close", () => {
      clearTimeout(timer);
      const r = readJobOutputAndClean<T>(job, opts.collector);
      if (!r.ok && stderr) r.limitation.hint = stderr.slice(0, 300);
      resolve(r);
    });
  });
}

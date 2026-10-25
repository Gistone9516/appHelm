// IF-14: 화면이 필요한 스크립트를 사용자 세션에서 실행한다.
// 서비스 세션(Session 0)에서는 1회용 예약 작업(/rl LIMITED /it)으로 띄우고, 끝나면 반드시 지운다 (F-7).
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import type { CollectorId } from "../core/types.ts";
import { prepareJob, readJobOutputAndClean, runPsScript, type PsResult } from "../ps/runner.ts";

/** 대화형 세션이면 SESSIONNAME이 있다 ("Console", "RDP-Tcp#0"). 서비스 세션에는 없다. REA_ADAPTER_SESSION으로 강제할 수 있다. */
export function needsScheduledTask(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.REA_ADAPTER_SESSION === "direct") return false;
  if (env.REA_ADAPTER_SESSION === "task") return true;
  return !env.SESSIONNAME;
}

function run(cmd: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.on("error", (e) => resolve({ code: -1, out: e.message }));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runInUserSession<T>(
  name: string,
  params: unknown,
  opts: { workDir: string; timeoutMs: number; collector: CollectorId },
): Promise<PsResult<T>> {
  if (!needsScheduledTask()) return runPsScript<T>(name, params, opts);

  const job = prepareJob(name, params, opts.workDir);
  if (/[\s"]/.test(job.script) || /[^\x20-\x7e]/.test(job.script)) {
    return {
      ok: false,
      limitation: { code: "E_PS_FAILED", collector: opts.collector, message: `예약 작업에 쓸 수 없는 작업 경로입니다: ${job.script}`, hint: "공백·한글이 없는 TEMP 경로가 필요합니다." },
    };
  }
  const task = `ReaAdapter-${process.pid}-${Date.now()}`;
  const tr = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ${job.script}`;
  try {
    const created = await run("schtasks", ["/create", "/tn", task, "/tr", tr, "/sc", "ONCE", "/st", "00:00", "/rl", "LIMITED", "/it", "/f"]);
    if (created.code !== 0) {
      return { ok: false, limitation: { code: "E_PS_FAILED", collector: opts.collector, message: "사용자 세션용 예약 작업을 만들지 못했습니다.", hint: created.out.slice(0, 300) } };
    }
    const started = await run("schtasks", ["/run", "/tn", task]);
    if (started.code !== 0) {
      return { ok: false, limitation: { code: "E_PS_FAILED", collector: opts.collector, message: "예약 작업을 실행하지 못했습니다. 사용자가 로그인해 있어야 합니다.", hint: started.out.slice(0, 300) } };
    }
    const deadline = Date.now() + opts.timeoutMs;
    while (Date.now() < deadline && !existsSync(job.output)) await sleep(250);
    if (!existsSync(job.output)) {
      return { ok: false, limitation: { code: "E_TIMEOUT", collector: opts.collector, message: `사용자 세션 작업이 ${opts.timeoutMs}ms 안에 끝나지 않았습니다.`, hint: "사용자가 로그인해 있는지 확인하세요." } };
    }
    return readJobOutputAndClean<T>(job, opts.collector);
  } finally {
    await run("schtasks", ["/delete", "/tn", task, "/f"]);
    rmSync(job.dir, { recursive: true, force: true });
  }
}

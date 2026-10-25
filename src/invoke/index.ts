// 실행 계층: 발견한 조작 방법을 실제로 실행한다. 사용자 지시로 미리보기 없이 바로 실행한다 (2026-10-25).
// 화면이 필요한 조작(window)은 사용자 세션에서 돈다 (IF-14).
import { request } from "node:http";
import { request as requestHttps } from "node:https";
import { spawn } from "node:child_process";
import type { Limitation } from "../core/types.ts";
import { asArray, runPsScript } from "../ps/runner.ts";
import { runInUserSession } from "../session/index.ts";

export type InvokeResult = { ok: true; detail: Record<string, unknown> } | { ok: false; limitation: Limitation };

export interface InvokeCtx {
  workDir: string;
  timeoutMs: number;
}

/** IF-26~28: 경로 문법은 `Paragraphs(3).Range`, `$저장이름.멤버`. each가 있으면 컬렉션을 돌며 props를 읽는다. */
export interface ComStep {
  path: string;
  args?: unknown[];
  setValue?: unknown;
  save?: string;
  each?: { props: string[]; max?: number };
}

export interface ComAction {
  kind: "com";
  progId: string;
  /** 단계 하나짜리 요청 (steps가 없을 때) */
  path?: string;
  attach?: boolean;
  args?: unknown[];
  setValue?: unknown;
  steps?: ComStep[];
  continueOnError?: boolean;
}

export interface ComStepResult {
  i: number;
  path: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** 단계 결과 중 첫 실패를 사람이 읽는 한 줄로 (IF-27). */
export function comFailureMessage(steps: ComStepResult[]): string {
  const bad = steps.find((s) => !s.ok);
  const done = steps.filter((s) => s.ok).length;
  return bad ? `단계 ${bad.i} (${bad.path}) 실패: ${bad.error} — 앞 단계 ${done}개 성공` : "실패";
}

export interface WindowAction {
  kind: "window";
  target: string;
  mode: "wm_command" | "keys";
  commandId?: number;
  keys?: string;
}

export interface HttpAction {
  kind: "http";
  url: string;
  method?: string;
  body?: string;
}

export interface ShellAction {
  kind: "shell";
  argv: string[];
}

export interface UiaAction {
  kind: "uia";
  target: string; // exe 전체 경로 또는 프로세스 이름(WINWORD.EXE)
  name?: string;
  automationId?: string;
  controlType?: string;
  pattern?: "Invoke" | "Toggle" | "Expand" | "Collapse" | "Select" | "Value";
  value?: string;
  nth?: number;
  list?: boolean; // 실행 대신 일치 요소 목록을 돌려준다 (버튼 이름 확인용)
}

export type InvokeAction = ComAction | WindowAction | HttpAction | ShellAction | UiaAction;

export async function invoke(action: InvokeAction, ctx: InvokeCtx): Promise<InvokeResult> {
  switch (action.kind) {
    case "com": {
      const params: Record<string, unknown> = { progId: action.progId, attach: !!action.attach };
      if (action.steps?.length) params.steps = action.steps;
      else {
        if (!action.path) return { ok: false, limitation: { code: "E_PARSE", collector: "invoke-com", message: "path 또는 steps가 필요합니다." } };
        params.path = action.path;
        if (action.args) params.args = action.args;
        if (action.setValue !== undefined) params.setValue = action.setValue;
      }
      if (action.continueOnError) params.continueOnError = true;
      const r = await runPsScript<{ ok: boolean; steps: ComStepResult[] }>("invoke-com.ps1", params, { workDir: ctx.workDir, timeoutMs: ctx.timeoutMs, collector: "invoke-com" });
      if (!r.ok) return { ok: false, limitation: r.limitation };
      const steps = asArray(r.data.steps);
      if (r.data.ok) return { ok: true, detail: { ok: true, steps } };
      return { ok: false, limitation: { code: "E_PS_FAILED", collector: "invoke-com", message: comFailureMessage(steps) } };
    }
    case "window": {
      // 창 조작은 대상과 같은 세션에서 돌아야 한다 (IF-14, F-7)
      const params = { target: action.target, mode: action.mode, commandId: action.commandId, keys: action.keys };
      const r = await runInUserSession<{ ok: boolean }>("invoke-window.ps1", params, { workDir: ctx.workDir, timeoutMs: ctx.timeoutMs + 20000, collector: "invoke-window" });
      return r.ok ? { ok: true, detail: r.data } : { ok: false, limitation: r.limitation };
    }
    case "uia": {
      // 화면 요소 조작도 대상과 같은 세션에서 돌아야 한다 (IF-14)
      const params: Record<string, unknown> = { target: action.target };
      if (action.name) params.name = action.name;
      if (action.automationId) params.automationId = action.automationId;
      if (action.controlType) params.controlType = action.controlType;
      if (action.pattern) params.pattern = action.pattern;
      if (action.value !== undefined) params.value = action.value;
      if (action.nth !== undefined) params.nth = action.nth;
      if (action.list) params.list = true;
      const r = await runInUserSession<{ ok: boolean }>("invoke-uia.ps1", params, { workDir: ctx.workDir, timeoutMs: ctx.timeoutMs + 25000, collector: "invoke-uia" });
      return r.ok ? { ok: true, detail: r.data } : { ok: false, limitation: r.limitation };
    }
    case "http":
      return invokeHttp(action, ctx);
    case "shell": {
      const [cmd, ...rest] = action.argv;
      if (!cmd) return { ok: false, limitation: { code: "E_PARSE", collector: "invoke-shell", message: "실행할 명령이 비어 있습니다." } };
      const child = spawn(cmd, rest, { windowsHide: true, detached: true, stdio: "ignore", shell: false });
      child.unref();
      return { ok: true, detail: { spawned: action.argv } };
    }
  }
}

function invokeHttp(action: HttpAction, ctx: InvokeCtx): Promise<InvokeResult> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(action.url);
    } catch {
      return resolve({ ok: false, limitation: { code: "E_PARSE", collector: "invoke-http", message: `URL이 올바르지 않습니다: ${action.url}` } });
    }
    const fn = u.protocol === "https:" ? requestHttps : request;
    const req = fn(u, { method: action.method ?? "GET", timeout: ctx.timeoutMs }, (res) => {
      let body = "";
      res.on("data", (d) => {
        if (body.length < 4096) body += d;
      });
      res.on("end", () => resolve({ ok: true, detail: { status: res.statusCode, body: body.slice(0, 4096) } }));
    });
    req.on("error", (e) => resolve({ ok: false, limitation: { code: "E_PS_FAILED", collector: "invoke-http", message: `요청 실패: ${e.message}` } }));
    req.on("timeout", () => req.destroy());
    if (action.body) req.write(action.body);
    req.end();
  });
}

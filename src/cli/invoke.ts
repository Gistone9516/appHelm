// invoke-com / invoke-window / invoke-http : 조작을 실제로 실행한다.
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invoke, type ComStep, type InvokeAction, type UiaAction } from "../invoke/index.ts";
import { remoteInvoke } from "../transport/client.ts";

function opt(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
const has = (rest: string[], name: string) => rest.includes(name);

export function buildAction(cmd: string, rest: string[]): InvokeAction | string {
  if (cmd === "invoke-com") {
    const progId = opt(rest, "--progid");
    const path = opt(rest, "--path");
    const stepsFile = opt(rest, "--steps");
    if (!progId || (!path && !stepsFile)) return "invoke-com에는 --progid와 --path(또는 --steps <JSON 파일>)가 필요합니다.";
    if (stepsFile) {
      // 단계 묶음은 파일로 받는다: 셸 인자로 JSON을 넘기면 따옴표가 지워진다 (SH-14)
      try {
        const steps = JSON.parse(readFileSync(stepsFile, "utf8").replace(/^\uFEFF/, "")) as ComStep[];
        if (!Array.isArray(steps)) return "--steps 파일은 단계 배열(JSON)이어야 합니다.";
        return { kind: "com", progId, steps, attach: has(rest, "--attach"), ...(has(rest, "--continue") ? { continueOnError: true } : {}) };
      } catch (e) {
        return `--steps 파일을 읽지 못했습니다: ${(e as Error).message}`;
      }
    }
    const action: InvokeAction = { kind: "com", progId, path: path!, attach: has(rest, "--attach") };
    // --text는 문자열 인자 하나를 그대로 넘긴다(JSON 따옴표가 셸에서 지워지는 문제 회피, SH-14)
    const text = opt(rest, "--text");
    const argsRaw = opt(rest, "--args");
    if (text !== undefined) {
      action.args = [text];
    } else if (argsRaw) {
      try {
        action.args = JSON.parse(argsRaw) as unknown[];
      } catch {
        return "--args는 JSON 배열이어야 합니다. (문자열 하나면 --text를 쓰세요)";
      }
    }
    const setRaw = opt(rest, "--set");
    if (setRaw !== undefined) {
      try {
        action.setValue = JSON.parse(setRaw);
      } catch {
        action.setValue = setRaw;
      }
    }
    return action;
  }
  if (cmd === "invoke-window") {
    const target = opt(rest, "--target");
    if (!target) return "invoke-window에는 --target이 필요합니다.";
    const wm = opt(rest, "--wm");
    const keys = opt(rest, "--keys");
    if (wm) return { kind: "window", target, mode: "wm_command", commandId: Number(wm) };
    if (keys) return { kind: "window", target, mode: "keys", keys };
    const show = opt(rest, "--show");
    if (show === "restore" || show === "minimize" || show === "maximize") return { kind: "window", target, mode: "show", state: show };
    return "invoke-window에는 --wm <명령ID>, --keys <키>, --show restore|minimize|maximize 중 하나가 필요합니다.";
  }
  if (cmd === "invoke-uia") {
    const target = opt(rest, "--target");
    if (!target) return "invoke-uia에는 --target이 필요합니다.";
    const action: InvokeAction = { kind: "uia", target };
    const name = opt(rest, "--name");
    const automationId = opt(rest, "--automation-id");
    const controlType = opt(rest, "--control-type");
    const pattern = opt(rest, "--pattern") as UiaAction["pattern"] | undefined;
    const value = opt(rest, "--value");
    const nth = opt(rest, "--nth");
    if (name) action.name = name;
    if (automationId) action.automationId = automationId;
    if (controlType) action.controlType = controlType;
    if (pattern) action.pattern = pattern;
    if (value !== undefined) action.value = value;
    if (nth !== undefined) action.nth = Number(nth);
    if (has(rest, "--list")) action.list = true;
    if (!name && !automationId && !controlType && !action.list) return "invoke-uia에는 --name / --automation-id / --control-type 중 하나(또는 --list)가 필요합니다.";
    return action;
  }
  if (cmd === "invoke-type") {
    const text = opt(rest, "--text");
    if (text === undefined) return "invoke-type에는 --text가 필요합니다.";
    const action: InvokeAction = { kind: "type", text };
    const x = opt(rest, "--x"); const y = opt(rest, "--y");
    if (x !== undefined && y !== undefined) { action.x = Number(x); action.y = Number(y); }
    if (has(rest, "--no-clear")) action.clear = false;
    if (has(rest, "--enter")) action.enter = true;
    return action;
  }
  if (cmd === "invoke-click") {
    const x = opt(rest, "--x");
    const y = opt(rest, "--y");
    if (x === undefined || y === undefined) return "invoke-click에는 --x와 --y가 필요합니다.";
    const action: InvokeAction = { kind: "click", x: Number(x), y: Number(y) };
    const target = opt(rest, "--target");
    if (target) action.target = target;
    const button = opt(rest, "--button");
    if (button === "right") action.button = "right";
    if (has(rest, "--double")) action.double = true;
    return action;
  }
  if (cmd === "invoke-screenshot") {
    const action: InvokeAction = { kind: "screenshot" };
    const target = opt(rest, "--target");
    if (target) action.target = target;
    if (has(rest, "--base64")) action.base64 = true;
    return action;
  }
  if (cmd === "invoke-http") {
    const url = opt(rest, "--url");
    if (!url) return "invoke-http에는 --url이 필요합니다.";
    const action: InvokeAction = { kind: "http", url };
    const method = opt(rest, "--method");
    if (method) action.method = method;
    const body = opt(rest, "--body");
    if (body) action.body = body;
    return action;
  }
  return `알 수 없는 명령: ${cmd}`;
}

export async function runInvoke(cmd: string, rest: string[]): Promise<number> {
  const action = buildAction(cmd, rest);
  if (typeof action === "string") {
    process.stderr.write(action + "\n");
    return 2;
  }
  const host = opt(rest, "--host");
  if (host) {
    // 큰 컬렉션 훑기(each)는 90초를 넘을 수 있다: --timeout <초>
    const r = await remoteInvoke(host, action, Number(opt(rest, "--timeout") ?? 90) * 1000);
    if (!r.ok) {
      process.stderr.write(`원격 오류: ${r.error}\n`);
      return 1;
    }
    process.stdout.write(JSON.stringify(r.result, null, 2) + "\n");
    return r.result.ok ? 0 : 1;
  }
  const workDir = join(tmpdir(), "apphelm");
  mkdirSync(workDir, { recursive: true });
  const result = await invoke(action, { workDir, timeoutMs: Number(opt(rest, "--timeout") ?? 60) * 1000 });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) {
    process.stderr.write(`실행 실패: ${result.limitation.message}${result.limitation.hint ? ` (${result.limitation.hint})` : ""}\n`);
    return 1;
  }
  return 0;
}

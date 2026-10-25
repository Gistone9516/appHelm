// invoke-com / invoke-window / invoke-http : 조작을 실제로 실행한다.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invoke, type InvokeAction, type UiaAction } from "../invoke/index.ts";
import { remoteInvoke } from "./client.ts";

function opt(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
const has = (rest: string[], name: string) => rest.includes(name);

export function buildAction(cmd: string, rest: string[]): InvokeAction | string {
  if (cmd === "invoke-com") {
    const progId = opt(rest, "--progid");
    const path = opt(rest, "--path");
    if (!progId || !path) return "invoke-com에는 --progid와 --path가 필요합니다.";
    const action: InvokeAction = { kind: "com", progId, path, attach: has(rest, "--attach") };
    const argsRaw = opt(rest, "--args");
    if (argsRaw) {
      try {
        action.args = JSON.parse(argsRaw) as unknown[];
      } catch {
        return "--args는 JSON 배열이어야 합니다.";
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
    return "invoke-window에는 --wm <명령ID> 또는 --keys <키>가 필요합니다.";
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
    if (!name && !automationId && !controlType) return "invoke-uia에는 --name / --automation-id / --control-type 중 하나가 필요합니다.";
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
    const r = await remoteInvoke(host, action);
    if (!r.ok) {
      process.stderr.write(`원격 오류: ${r.error}\n`);
      return 1;
    }
    process.stdout.write(JSON.stringify(r.result, null, 2) + "\n");
    return r.result.ok ? 0 : 1;
  }
  const workDir = join(tmpdir(), "rea-adapter");
  mkdirSync(workDir, { recursive: true });
  const result = await invoke(action, { workDir, timeoutMs: 60000 });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.ok) {
    process.stderr.write(`실행 실패: ${result.limitation.message}${result.limitation.hint ? ` (${result.limitation.hint})` : ""}\n`);
    return 1;
  }
  return 0;
}

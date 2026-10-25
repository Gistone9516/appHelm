// AppHelm MCP stdio 서버 (의존성 없음). Claude Code가 map/invoke를 직접 호출한다.
// stdout은 JSON-RPC 전용. 모든 로그는 stderr.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapProgram } from "../core/pipeline.ts";
import type { CollectorContext, OperationDoc } from "../core/types.ts";
import { merge } from "../merge/index.ts";
import { createProbe } from "../probe/index.ts";
import { createReaRunner } from "../rea-bridge/runner.ts";
import { renderMarkdown } from "../render/markdown.ts";
import { ALL_COLLECTORS } from "../cli/collectors.ts";
import { invoke, type InvokeAction } from "../invoke/index.ts";
import { remoteInvoke, remoteMap } from "../transport/client.ts";
import { tailnetNodes } from "../transport/host.ts";
import { runNativeTrace } from "../trace/index.ts";
import { NO_REPLY, serveStdio } from "./jsonrpc.ts";

const PROTOCOL = "2024-11-05";
const DOC_DIR = join(process.env.LOCALAPPDATA ?? tmpdir(), "apphelm", "docs");
const WORK_DIR = join(tmpdir(), "apphelm");
// MCP에 노출하는 조작 종류 (shell 제외: 임의 명령 실행 방지, 주변 브리핑 2026-10-25)
const ALLOWED_INVOKE = new Set(["com", "window", "uia", "http"]);

function log(m: string): void {
  process.stderr.write(`[rea-mcp] ${m}\n`);
}

const text = (s: string) => ({ content: [{ type: "text", text: s }] });
const errText = (s: string) => ({ content: [{ type: "text", text: s }], isError: true });

function docPath(host: string | undefined, target: string): string {
  const stem = target.replace(/[\\/:*?"<>|]/g, "_").replace(/\.[^.]+$/, "").slice(-80);
  return join(DOC_DIR, `${(host ?? "local").replace(/[\\/:*?"<>|]/g, "_")}__${stem}.ops.json`);
}

async function localMap(target: string, live: boolean, lang: string): Promise<OperationDoc | { error: string }> {
  mkdirSync(WORK_DIR, { recursive: true });
  const ctx: CollectorContext = {
    allow: { live, launch: false },
    timeoutMs: 180000,
    workDir: WORK_DIR,
    lang,
    rea: createReaRunner({ workDir: WORK_DIR, timeoutMs: 180000, log }),
    log,
  };
  const r = await mapProgram(target, ctx, { probe: createProbe(lang), collectors: ALL_COLLECTORS, merge });
  if ("error" in r) return { error: r.error.map((l) => `${l.message}${l.hint ? ` (${l.hint})` : ""}`).join("; ") };
  return r;
}

async function toolMapProgram(args: Record<string, unknown>): Promise<ReturnType<typeof text>> {
  const target = String(args.target ?? "");
  const host = args.host ? String(args.host) : undefined;
  const live = args.live === true;
  const lang = String(args.lang ?? Intl.DateTimeFormat().resolvedOptions().locale ?? "en-US");
  if (!target) return errText("target이 필요합니다.");

  let doc: OperationDoc;
  if (host) {
    const r = await remoteMap(host, target, { live, lang });
    if (!r.ok) return errText(`원격 map 실패 (${host}): ${r.error}\n(참고: 무설치 PowerShell 에이전트는 map을 지원하지 않습니다. 원격 map은 'apphelm serve' Node 에이전트 노드에서만 됩니다.)`);
    doc = r.doc;
  } else {
    const r = await localMap(target, live, lang);
    if ("error" in r) return errText(`map 실패: ${r.error}`);
    doc = r;
  }
  mkdirSync(DOC_DIR, { recursive: true });
  const path = docPath(host, target);
  writeFileSync(path, JSON.stringify(doc, null, 2), "utf8");
  const md = renderMarkdown(doc, path);
  return text(`${md}\n(전체 문서는 get_operation_doc 으로 조회하세요. 캐시: ${path})`);
}

function sectionOf(doc: OperationDoc, section: string): unknown {
  switch (section) {
    case "summary": return doc.summary;
    case "operations": return doc.operations;
    case "menus": return doc.ui.menus;
    case "dialogs": return doc.ui.dialogs;
    case "forms": return doc.ui.forms;
    case "live": return doc.ui.live ?? null;
    case "automation": return doc.automation;
    case "capabilities": return doc.capabilities;
    case "version": return doc.version;
    case "limitations": return doc.limitations;
    case "runtime": return doc.runtime ?? null;
    default: return undefined;
  }
}

function filterByQuery(value: unknown, query: string): unknown {
  if (!query) return value;
  const q = query.toLowerCase();
  if (Array.isArray(value)) {
    const hit = value.filter((v) => JSON.stringify(v).toLowerCase().includes(q));
    return hit.length ? hit : value.slice(0, 0);
  }
  return value;
}

function toolGetDoc(args: Record<string, unknown>): ReturnType<typeof text> {
  const target = String(args.target ?? "");
  const host = args.host ? String(args.host) : undefined;
  const section = String(args.section ?? "");
  const query = args.query ? String(args.query) : "";
  if (!target || !section) return errText("target과 section이 필요합니다.");
  const path = docPath(host, target);
  if (!existsSync(path)) return errText(`먼저 map_program(target='${target}'${host ? `, host='${host}'` : ""})을 실행하세요. 캐시 없음: ${path}`);
  let doc: OperationDoc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8")) as OperationDoc;
  } catch (e) {
    return errText(`문서를 읽지 못했습니다: ${(e as Error).message}`);
  }
  const sec = sectionOf(doc, section);
  if (sec === undefined) return errText(`알 수 없는 section: ${section}. 가능: summary, operations, menus, dialogs, forms, live, automation, capabilities, version, limitations, runtime`);
  return text(JSON.stringify(filterByQuery(sec, query), null, 2).slice(0, 60000));
}

async function toolInvoke(args: Record<string, unknown>): Promise<ReturnType<typeof text>> {
  const host = args.host ? String(args.host) : undefined;
  const action = args.action as (Record<string, unknown> & { kind?: string; path?: string; name?: string; url?: string }) | undefined;
  if (!action || typeof action !== "object" || !action.kind) return errText("action.kind가 필요합니다.");
  if (!ALLOWED_INVOKE.has(String(action.kind))) return errText(`이 도구로는 ${action.kind} 조작을 할 수 없습니다. 허용: com, window, uia, http.`);
  log(`invoke ${host ?? "local"} ${action.kind} ${action.path ?? action.name ?? action.url ?? ""}`);
  if (host) {
    const r = await remoteInvoke(host, action as unknown as InvokeAction);
    if (!r.ok) return errText(`원격 invoke 실패 (${host}): ${r.error}`);
    return r.result.ok ? text(JSON.stringify(r.result.detail, null, 2)) : errText(`${r.result.limitation.code}: ${r.result.limitation.message}${r.result.limitation.hint ? ` (${r.result.limitation.hint})` : ""}`);
  }
  mkdirSync(WORK_DIR, { recursive: true });
  const res = await invoke(action as unknown as InvokeAction, { workDir: WORK_DIR, timeoutMs: 60000 });
  return res.ok ? text(JSON.stringify(res.detail, null, 2)) : errText(`${res.limitation.code}: ${res.limitation.message}${res.limitation.hint ? ` (${res.limitation.hint})` : ""}`);
}

async function toolTraceNative(args: Record<string, unknown>): Promise<ReturnType<typeof text>> {
  const target = String(args.target ?? "");
  const query = args.query ? String(args.query) : undefined;
  if (!target) return errText("target이 필요합니다.");
  const r = await runNativeTrace(target, { query, log });
  if (!r.ok) return errText(`${r.limitation.code}: ${r.limitation.message}${r.limitation.hint ? ` (${r.limitation.hint})` : ""}`);
  return text(JSON.stringify(r.trace, null, 2).slice(0, 60000));
}

function toolListHosts(): ReturnType<typeof text> {
  const nodes = tailnetNodes();
  const rows = nodes.map((n) => `${n.ip}  ${n.name}  ${n.os}  ${n.online ? "online" : "offline"}`);
  return text(["(로컬) 이 PC — host 생략 시 대상", ...rows, "", "원격 조작은 그 노드에서 agent/apphelm-agent.ps1(또는 apphelm serve)가 실행 중이어야 하며 같은 토큰이 필요합니다."].join("\n"));
}

const TOOLS = [
  {
    name: "list_hosts",
    description: "조작 가능한 노드 목록(로컬 + Tailscale 노드). host 인자 없이 호출하면 이 PC를 대상으로 합니다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "map_program",
    description: "대상 프로그램(exe 경로/이름/PID 폴더)을 분석해 AI가 읽는 조작 문서 요약(≤4KB)을 돌려줍니다. 전체는 get_operation_doc으로. host 지정 시 그 노드에서 실행(원격 map은 Node serve 에이전트 노드만).",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "exe 전체 경로 또는 이름(notepad)" },
        host: { type: "string", description: "원격 노드 이름/IP (생략=로컬)" },
        live: { type: "boolean", description: "실행 중인 창의 UI 요소도 수집(대상이 떠 있어야 함)" },
      },
      required: ["target"],
    },
  },
  {
    name: "get_operation_doc",
    description: "직전 map_program 결과의 특정 섹션을 조회합니다. section: summary|operations|menus|dialogs|forms|live|automation|capabilities|version|limitations|runtime. query로 부분 문자열 필터.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string" },
        host: { type: "string" },
        section: { type: "string" },
        query: { type: "string", description: "선택: 섹션 내 부분 문자열 필터" },
      },
      required: ["target", "section"],
    },
  },
  {
    name: "invoke_operation",
    description: "조작을 즉시 실행합니다(미리보기 없음). action.kind: com|window|uia|http. 실행 전 map_program/get_operation_doc으로 방법을 확인하고, COM은 ActiveDocument.Name 등으로 대상을 먼저 읽어 확인하길 권장합니다. 대상 PC에 에이전트가 실행 중이어야 원격 조작이 됩니다.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "원격 노드 (생략=로컬)" },
        action: {
          type: "object",
          description: "com: {kind,progId,path,attach?,args?,setValue?} / window: {kind,target,mode:wm_command|keys,commandId?,keys?} / uia: {kind,target,name?,automationId?,controlType?,pattern?,value?,list?} / http: {kind,url,method?,body?}",
          properties: { kind: { type: "string", enum: ["com", "window", "uia", "http"] } },
          required: ["kind"],
        },
      },
      required: ["action"],
    },
  },
  {
    name: "trace_native",
    description: "네이티브 PE(exe/dll)를 Ghidra로 정적 분석해 이미지 개요(세그먼트·함수 수·문자열 수)와, query가 있으면 이름이 맞는 함수 목록을 돌려줍니다. 느립니다(콜드 스타트 수백 초). Ghidra+JDK가 설치돼 있어야 하고 .NET 등 관리 코드는 지원 안 합니다. 로컬 전용.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "네이티브 exe/dll 경로" },
        query: { type: "string", description: "선택: 찾을 함수 이름(부분/정규)" },
      },
      required: ["target"],
    },
  },
];

export function startMcpServer(): void {
  log("AppHelm MCP 서버 시작 (stdio)");
  serveStdio(process.stdin, process.stdout, async (method, params) => {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: "apphelm", version: "0.1.0" },
        };
      case "notifications/initialized":
      case "notifications/cancelled":
        return NO_REPLY;
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "tools/call": {
        const name = String(params.name ?? "");
        const a = (params.arguments ?? {}) as Record<string, unknown>;
        switch (name) {
          case "list_hosts": return toolListHosts();
          case "map_program": return await toolMapProgram(a);
          case "get_operation_doc": return toolGetDoc(a);
          case "invoke_operation": return await toolInvoke(a);
          case "trace_native": return await toolTraceNative(a);
          default: return errText(`알 수 없는 도구: ${name}`);
        }
      }
      default:
        return NO_REPLY;
    }
  }, log);
}

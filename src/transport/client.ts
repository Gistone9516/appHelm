// 원격 에이전트 호출 클라이언트. (cli/에서 transport/로 이동: cli는 아무도 import할 수 없는 최상위 계층)
import { request } from "node:http";
import type { InvokeAction, InvokeResult } from "../invoke/index.ts";
import type { Limitation, OperationDoc } from "../core/types.ts";
import { resolveHost } from "./host.ts";

// 8766은 이 환경에서 다른 서비스와 충돌해 47817로 둔다 (측정 2026-10-25)
export const DEFAULT_PORT = 47817;

function token(): string {
  return process.env.APPHELM_TOKEN ?? "";
}

function send<T>(method: "GET" | "POST", ip: string, port: number, path: string, body: unknown, timeoutMs: number): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string | number> = { "x-rea-token": token() };
    if (method === "POST") {
      headers["content-type"] = "application/json; charset=utf-8";
      headers["content-length"] = Buffer.byteLength(payload);
    }
    const req = request({ host: ip, port, path, method, timeout: timeoutMs, headers }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve({ ok: false, error: `HTTP ${res.statusCode}: ${b.slice(0, 200)}` });
        try {
          resolve({ ok: true, data: JSON.parse(b) as T });
        } catch {
          resolve({ ok: false, error: "응답을 읽지 못했습니다." });
        }
      });
    });
    req.on("error", (e) => resolve({ ok: false, error: `${e.message} (에이전트가 그 노드에서 실행 중인지, 토큰이 맞는지 확인하세요)` }));
    req.on("timeout", () => req.destroy(new Error("시간 초과")));
    if (method === "POST") req.end(payload);
    else req.end();
  });
}

/** 노드 하나의 에이전트 생존·버전 확인. */
export async function remoteHealth(host: string, port = DEFAULT_PORT): Promise<{ ok: true; data: { node?: string; version?: string; capabilities?: string[] } } | { ok: false; error: string }> {
  const r = resolveHost(host);
  if ("error" in r) return { ok: false, error: r.error };
  return send("GET", r.ip, port, "/health", undefined, 8000);
}

export async function remoteMap(
  host: string,
  target: string,
  opts: { live: boolean; lang: string },
): Promise<{ ok: true; doc: OperationDoc } | { ok: false; error: string }> {
  const r = resolveHost(host);
  if ("error" in r) return { ok: false, error: r.error };
  const res = await send<OperationDoc | { error: Limitation[] }>("POST", r.ip, DEFAULT_PORT, "/map", { target, live: opts.live, lang: opts.lang }, 240000);
  if (!res.ok) return res;
  // 에이전트는 probe 실패도 HTTP 200으로 {error: Limitation[]}를 보낸다 — 여기서 걸러낸다 (현장 브리핑 2026-10-25)
  if ("error" in res.data) return { ok: false, error: res.data.error.map((l) => l.message).join("; ") };
  return { ok: true, doc: res.data };
}

export async function remoteInvoke(host: string, action: InvokeAction): Promise<{ ok: true; result: InvokeResult } | { ok: false; error: string }> {
  const r = resolveHost(host);
  if ("error" in r) return { ok: false, error: r.error };
  if (!token()) return { ok: false, error: "APPHELM_TOKEN 환경 변수가 필요합니다 (에이전트와 같은 토큰)." };
  const res = await send<InvokeResult>("POST", r.ip, DEFAULT_PORT, "/invoke", { action }, 90000);
  return res.ok ? { ok: true, result: res.data } : res;
}

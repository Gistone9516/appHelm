// 원격 에이전트 호출 클라이언트.
import { request } from "node:http";
import type { InvokeAction, InvokeResult } from "../invoke/index.ts";
import type { OperationDoc } from "../core/types.ts";
import { resolveHost } from "../transport/host.ts";

// 8766은 이 환경에서 다른 서비스와 충돌해 47817로 둔다 (측정 2026-10-25)
export const DEFAULT_PORT = 47817;

function token(): string {
  return process.env.REA_ADAPTER_TOKEN ?? "";
}

function post<T>(ip: string, path: string, body: unknown, timeoutMs: number): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = request(
      { host: ip, port: DEFAULT_PORT, path, method: "POST", timeout: timeoutMs, headers: { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload), "x-rea-token": token() } },
      (res) => {
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
      },
    );
    req.on("error", (e) => resolve({ ok: false, error: `${e.message} (에이전트가 그 노드에서 실행 중인지, 토큰이 맞는지 확인하세요)` }));
    req.on("timeout", () => req.destroy(new Error("시간 초과")));
    req.end(payload);
  });
}

export async function remoteMap(host: string, target: string, opts: { live: boolean; lang: string }): Promise<{ ok: true; doc: OperationDoc } | { ok: false; error: string }> {
  const r = resolveHost(host);
  if ("error" in r) return { ok: false, error: r.error };
  const res = await post<OperationDoc>(r.ip, "/map", { target, live: opts.live, lang: opts.lang }, 240000);
  return res.ok ? { ok: true, doc: res.data } : res;
}

export async function remoteInvoke(host: string, action: InvokeAction): Promise<{ ok: true; result: InvokeResult } | { ok: false; error: string }> {
  const r = resolveHost(host);
  if ("error" in r) return { ok: false, error: r.error };
  if (!token()) return { ok: false, error: "REA_ADAPTER_TOKEN 환경 변수가 필요합니다 (에이전트와 같은 토큰)." };
  const res = await post<InvokeResult>(r.ip, "/invoke", { action }, 90000);
  return res.ok ? { ok: true, result: res.data } : res;
}

// 의존성 없는 stdio JSON-RPC 2.0 (MCP 하위 집합). stdout은 프로토콜 전용, 로그는 stderr.
import type { Readable, Writable } from "node:stream";

export interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export type RpcHandler = (method: string, params: Record<string, unknown>) => Promise<unknown> | unknown;

const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

/** 줄 단위가 아니라 Content-Length 프레이밍도 아니고, MCP stdio는 개행 구분 JSON을 쓴다. */
export function serveStdio(stdin: Readable, stdout: Writable, handle: RpcHandler, log: (m: string) => void): void {
  let buf = "";
  const write = (obj: unknown) => stdout.write(JSON.stringify(obj) + "\n");

  stdin.setEncoding("utf8");
  stdin.on("data", (chunk: string) => {
    buf += chunk;
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      void dispatch(line);
    }
  });

  async function dispatch(line: string): Promise<void> {
    let req: RpcRequest;
    try {
      req = JSON.parse(line) as RpcRequest;
    } catch {
      write({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "JSON 파싱 실패" } });
      return;
    }
    const isNotification = req.id === undefined || req.id === null;
    try {
      const result = await handle(req.method, req.params ?? {});
      if (result === NO_REPLY) return; // 알림(notification)엔 응답하지 않는다
      if (!isNotification) write({ jsonrpc: "2.0", id: req.id, result });
    } catch (e) {
      const err = e as { code?: number; message?: string };
      log(`method ${req.method} 오류: ${err.message}`);
      if (!isNotification) write({ jsonrpc: "2.0", id: req.id, error: { code: err.code ?? INTERNAL_ERROR, message: err.message ?? String(e) } });
    }
  }
}

/** 핸들러가 이 값을 돌려주면 응답을 보내지 않는다(알림 처리용). */
export const NO_REPLY = Symbol("no-reply");

export class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

export const METHOD_NOT_FOUND_CODE = METHOD_NOT_FOUND;

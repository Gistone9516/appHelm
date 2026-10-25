// 에이전트 HTTP 핸들러: 이 노드에서 map/invoke를 실행한다. serve가 띄운다.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapProgram } from "../core/pipeline.ts";
import type { Collector, CollectorContext } from "../core/types.ts";
import { merge } from "../merge/index.ts";
import { createProbe } from "../probe/index.ts";
import { createReaRunner } from "../rea-bridge/runner.ts";
import { invoke, type InvokeAction } from "../invoke/index.ts";

export interface AgentOptions {
  token: string;
  port: number;
  binds: string[]; // 바인딩할 주소들 (loopback + Tailscale IP)
  collectors: Collector[];
  log: (m: string) => void;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (d) => {
      b += d;
      if (b.length > 8 * 1024 * 1024) reject(new Error("요청이 너무 큽니다"));
    });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}

export async function startAgent(opts: AgentOptions): Promise<() => void> {
  const workDir = join(tmpdir(), "apphelm");
  mkdirSync(workDir, { recursive: true });

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (code: number, obj: unknown) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(obj));
    };
    try {
      if (req.headers["x-rea-token"] !== opts.token) return send(401, { error: "토큰이 올바르지 않습니다." });
      const url = req.url ?? "/";
      if (req.method === "GET" && url === "/health") return send(200, { ok: true, node: process.env.COMPUTERNAME ?? "" });
      const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : {};

      if (req.method === "POST" && url === "/map") {
        const lang = String(body.lang ?? "en-US");
        const ctx: CollectorContext = {
          allow: { live: !!body.live, launch: !!body.launch },
          timeoutMs: 180000,
          workDir,
          lang,
          rea: createReaRunner({ workDir, timeoutMs: 180000, log: opts.log }),
          log: opts.log,
        };
        const result = await mapProgram(String(body.target), ctx, { probe: createProbe(lang), collectors: opts.collectors, merge });
        return send(200, result);
      }
      if (req.method === "POST" && url === "/invoke") {
        opts.log(`invoke: ${JSON.stringify(body.action)}`);
        const result = await invoke(body.action as InvokeAction, { workDir, timeoutMs: 60000 });
        return send(200, result);
      }
      return send(404, { error: "알 수 없는 경로" });
    } catch (e) {
      send(500, { error: (e as Error).message });
    }
  };

  // http.Server는 주소 하나만 listen하므로 바인딩 주소마다 서버를 만든다 (0.0.0.0 공개 금지)
  const servers = opts.binds.map(() => createServer((req, res) => void handler(req, res)));
  try {
    await Promise.all(
      servers.map(
        (server, i) =>
          new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(opts.port, opts.binds[i]!, resolve);
          }),
      ),
    );
  } catch (e) {
    // 한 주소라도 바인딩에 실패하면 나머지도 닫아 포트가 새지 않게 한다
    servers.forEach((s) => s.close());
    throw e;
  }
  opts.log(`에이전트 실행: ${opts.binds.map((b) => `http://${b}:${opts.port}`).join(", ")}`);
  return () => servers.forEach((s) => s.close());
}

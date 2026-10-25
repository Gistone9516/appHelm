import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { NO_REPLY, serveStdio } from "../../src/mcp/jsonrpc.ts";

/** serveStdio에 요청을 흘려보내고 응답 줄들을 모은다. */
function drive(handler: Parameters<typeof serveStdio>[2], lines: unknown[]): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const out: Record<string, unknown>[] = [];
    stdout.setEncoding("utf8");
    let buf = "";
    stdout.on("data", (d: string) => {
      buf += d;
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) out.push(JSON.parse(line));
      }
    });
    serveStdio(stdin, stdout, handler, () => {});
    for (const l of lines) stdin.write(JSON.stringify(l) + "\n");
    setTimeout(() => resolve(out), 100);
  });
}

test("JSON-RPC: 요청에 응답, 알림엔 무응답", async () => {
  const handler = async (method: string) => (method === "ping" ? { pong: true } : NO_REPLY);
  const out = await drive(handler, [
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" }, // id 없음 → 무응답
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.id, 1);
  assert.deepEqual(out[0]!.result, { pong: true });
});

test("JSON-RPC: 파싱 실패는 error 응답", async () => {
  const out = await new Promise<Record<string, unknown>[]>((resolve) => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const got: Record<string, unknown>[] = [];
    stdout.setEncoding("utf8");
    stdout.on("data", (d: string) => d.split("\n").filter(Boolean).forEach((l) => got.push(JSON.parse(l))));
    serveStdio(stdin, stdout, () => NO_REPLY, () => {});
    stdin.write("{bad json\n");
    setTimeout(() => resolve(got), 60);
  });
  assert.equal((out[0]!.error as { code: number }).code, -32700);
});

test("JSON-RPC: 핸들러 예외는 error로 변환", async () => {
  const handler = () => {
    throw new Error("터짐");
  };
  const out = await drive(handler, [{ jsonrpc: "2.0", id: 7, method: "x" }]);
  assert.equal(out[0]!.id, 7);
  assert.match((out[0]!.error as { message: string }).message, /터짐/);
});

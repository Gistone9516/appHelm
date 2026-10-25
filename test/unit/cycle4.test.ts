import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStatus, resolveHost } from "../../src/transport/host.ts";
import { buildAction } from "../../src/cli/invoke.ts";

const STATUS = `100.91.223.53   desktop-r3ckfmf  ckfflem@  windows  -
100.67.200.125  book-akvd4hpqjf  ckfflem@  windows  active; direct 121.67.233.18:41641, tx 72704 rx 30924
100.88.13.62    s25              ckfflem@  android  offline, last seen 66d ago`;

test("tailscale status 파싱", () => {
  const nodes = parseStatus(STATUS);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[1], { ip: "100.67.200.125", name: "book-akvd4hpqjf", os: "windows", online: true });
  assert.equal(nodes[2]!.online, false);
});

test("IP는 그대로 통과", () => {
  const r = resolveHost("100.67.200.125");
  assert.deepEqual(r, { ip: "100.67.200.125" });
});

test("invoke-com 액션 구성", () => {
  const a = buildAction("invoke-com", ["--progid", "Word.Application", "--attach", "--path", "Selection.TypeText", "--args", '["안녕"]']);
  assert.deepEqual(a, { kind: "com", progId: "Word.Application", path: "Selection.TypeText", attach: true, args: ["안녕"] });
});

test("invoke-com 속성 설정", () => {
  const a = buildAction("invoke-com", ["--progid", "Word.Application", "--path", "Selection.Font.Bold", "--set", "true"]);
  assert.ok(typeof a !== "string" && a.kind === "com");
  assert.equal((a as { setValue: unknown }).setValue, true);
});

test("invoke-com 필수 옵션 누락", () => {
  assert.equal(typeof buildAction("invoke-com", ["--progid", "X"]), "string");
});

test("invoke-window 액션 구성 (wm, keys)", () => {
  assert.deepEqual(buildAction("invoke-window", ["--target", "C:\\x.exe", "--wm", "26"]), { kind: "window", target: "C:\\x.exe", mode: "wm_command", commandId: 26 });
  assert.deepEqual(buildAction("invoke-window", ["--target", "C:\\x.exe", "--keys", "^s"]), { kind: "window", target: "C:\\x.exe", mode: "keys", keys: "^s" });
});

test("invoke-http 액션 구성", () => {
  assert.deepEqual(buildAction("invoke-http", ["--url", "http://127.0.0.1:6463/rpc", "--method", "POST", "--body", "{}"]), {
    kind: "http",
    url: "http://127.0.0.1:6463/rpc",
    method: "POST",
    body: "{}",
  });
});

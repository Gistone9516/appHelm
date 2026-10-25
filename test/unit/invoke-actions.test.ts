import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAction } from "../../src/cli/invoke.ts";

test("IF-34: invoke-click은 좌표·버튼·더블클릭을 파싱한다", () => {
  assert.deepEqual(buildAction("invoke-click", ["--x", "2156", "--y", "802"]), { kind: "click", x: 2156, y: 802 });
  assert.deepEqual(buildAction("invoke-click", ["--x", "10", "--y", "20", "--button", "right", "--double", "--target", "KakaoTalk.exe"]), {
    kind: "click",
    x: 10,
    y: 20,
    target: "KakaoTalk.exe",
    button: "right",
    double: true,
  });
  assert.equal(typeof buildAction("invoke-click", ["--x", "1"]), "string"); // --y 없음
});

test("IF-34: invoke-screenshot은 대상·base64를 파싱한다", () => {
  assert.deepEqual(buildAction("invoke-screenshot", []), { kind: "screenshot" });
  assert.deepEqual(buildAction("invoke-screenshot", ["--target", "수안", "--base64"]), { kind: "screenshot", target: "수안", base64: true });
});

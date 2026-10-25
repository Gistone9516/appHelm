// rea-adapter serve : 이 PC를 에이전트로 띄운다. loopback과 Tailscale 주소에만 바인딩한다.
import { randomBytes } from "node:crypto";
import { startAgent } from "../server/agent.ts";
import { ownTailscaleIp } from "../transport/host.ts";
import { ALL_COLLECTORS } from "./collectors.ts";
import { DEFAULT_PORT } from "../transport/client.ts";

export async function runServe(rest: string[]): Promise<number> {
  let port = DEFAULT_PORT;
  let token = process.env.REA_ADAPTER_TOKEN ?? "";
  let localOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const v = rest[i]!;
    if (v === "--port") port = Number(rest[++i] ?? port);
    else if (v === "--token") token = rest[++i] ?? token;
    else if (v === "--local-only") localOnly = true;
  }
  if (!token) {
    token = randomBytes(16).toString("hex");
    process.stderr.write(`토큰을 새로 만들었습니다. 조작하는 쪽에서 이 값을 쓰세요:\n  REA_ADAPTER_TOKEN=${token}\n`);
  }

  const binds = ["127.0.0.1"];
  const ts = ownTailscaleIp();
  if (ts && !localOnly) binds.push(ts);
  else if (!ts && !localOnly) process.stderr.write("경고: Tailscale IP를 찾지 못해 loopback에만 바인딩합니다. 원격에서 닿지 않습니다.\n");

  const log = (m: string) => process.stderr.write(`· ${m}\n`);
  const stop = await startAgent({ token, port, binds, collectors: ALL_COLLECTORS, log });
  process.stderr.write(`준비됐습니다. 조작하는 쪽에서: rea-adapter map <대상> --host ${ts ?? "127.0.0.1"}\n`);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  await new Promise<void>(() => {}); // 계속 실행
  return 0;
}

#!/usr/bin/env node
// MCP stdio 진입점 래퍼: tsx로 TypeScript 서버를 바로 실행한다 (빌드 없음).
// stdout은 JSON-RPC 전용이므로, 이 래퍼는 stdio를 그대로 상속해 아무것도 출력하지 않는다.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const child = spawn(process.execPath, [tsxCli, join(root, "src", "mcp", "main.ts")], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));

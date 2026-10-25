#!/usr/bin/env node
// 실행 진입점: tsx로 TypeScript 소스를 바로 실행한다 (빌드 단계 없음)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const result = spawnSync(process.execPath, [tsxCli, join(root, "src", "cli", "main.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

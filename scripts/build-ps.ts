// IF-29: src/ps/com-core.ps1을 에이전트와 invoke-com.ps1의 표지 사이에 그대로 넣는다.
// --check: 고치지 않고 어긋난 파일이 있으면 실패한다 (테스트와 커밋 전 확인용).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = "# >>> com-core (generated from src/ps/com-core.ps1 by scripts/build-ps.ts; do not edit here)";
const END = "# <<< com-core";
export const COM_CORE_TARGETS = ["agent/apphelm-agent.ps1", "src/ps/scripts/invoke-com.ps1"];

export function coreText(): string {
  return readFileSync(join(ROOT, "src/ps/com-core.ps1"), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n").trimEnd();
}

/** 표지 사이를 core로 바꾼 결과. 표지가 없으면 오류. BOM과 줄바꿈 방식은 원래 파일을 따른다. */
export function inline(file: string, core: string): string {
  const raw = readFileSync(join(ROOT, file), "utf8");
  const bom = raw.startsWith("﻿") ? "﻿" : "";
  const crlf = raw.includes("\r\n");
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${file}: com-core 표지가 없습니다`);
  const out = text.slice(0, a + START.length) + "\n" + core + "\n" + text.slice(b);
  return bom + (crlf ? out.replace(/\n/g, "\r\n") : out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const core = coreText();
  let stale = 0;
  for (const f of COM_CORE_TARGETS) {
    const next = inline(f, core);
    const cur = readFileSync(join(ROOT, f), "utf8");
    if (next === cur) continue;
    stale++;
    if (check) console.error(`어긋남: ${f} (npm run build:ps 필요)`);
    else {
      writeFileSync(join(ROOT, f), next, "utf8");
      console.log(`갱신: ${f}`);
    }
  }
  if (check && stale) process.exit(1);
}

// IF-3 모듈 경계 검사: 폴더마다 import해도 되는 폴더만 import하는지 확인한다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..", "src");

// 폴더 → import 가능한 폴더 (자기 자신은 항상 허용)
const ALLOWED: Record<string, string[]> = {
  core: [],
  pe: ["core"],
  decoders: ["core"],
  "rea-bridge": ["core"],
  ps: ["core"],
  session: ["core", "ps"],
  transport: ["core", "invoke"],
  invoke: ["core", "ps", "session"],
  mcp: ["core", "transport", "invoke", "probe", "merge", "render", "rea-bridge", "collectors", "cli"],
  collectors: ["core", "pe", "decoders", "rea-bridge", "ps", "session"],
  server: ["core", "pe", "decoders", "rea-bridge", "ps", "session", "probe", "merge", "invoke", "collectors"],
  probe: ["core", "pe"],
  merge: ["core"],
  render: ["core"],
  cli: ["core", "pe", "decoders", "rea-bridge", "ps", "session", "transport", "invoke", "server", "collectors", "probe", "merge", "render"],
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const topOf = (file: string) => relative(root, file).split(sep)[0]!;
const collectorOf = (file: string) => relative(root, file).split(sep)[1];

let violations = 0;
for (const file of walk(root)) {
  const from = topOf(file);
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
    const target = resolve(dirname(file), m[1]!);
    const to = topOf(target);
    const ok = to === from ? !(from === "collectors" && collectorOf(file) !== collectorOf(target)) : (ALLOWED[from] ?? []).includes(to);
    if (!ok) {
      violations++;
      console.log(`위반: ${relative(root, file)} → ${m[1]}`);
    }
  }
}
console.log(violations ? `모듈 경계 위반 ${violations}건` : "모듈 경계 위반 없음");
process.exit(violations ? 1 : 0);

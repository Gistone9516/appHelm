// 수집원 registry-verbs: 대상을 실행하는 셸 동사, 연결 프로그램, URL 프로토콜, App Paths (IF-18)
import type { Collector, CollectorContext, Evidence, Target } from "../../core/types.ts";
import { asArray, runPsScript } from "../../ps/runner.ts";

const ID = "registry-verbs";

interface VerbsOutput {
  verbs: { progId: string; verb: string; template: string; extensions: string[] }[];
  protocols: { scheme: string; verb: string; template: string }[];
  appPaths: { name: string; template: string }[];
}

/** 명령 템플릿을 인자 배열로 나눈다. 큰따옴표로 묶인 부분은 하나로 본다. %1 등은 그대로 둔다. */
export function splitTemplate(template: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  for (let m = re.exec(template); m; m = re.exec(template)) out.push(m[1] ?? m[2]!);
  return out;
}

export const registryVerbs: Collector = {
  id: ID,
  sideEffect: "reads-registry",
  appliesTo: (t: Target) => !!t.pe && !t.pe.isDll,
  async collect(t: Target, ctx: CollectorContext) {
    const r = await runPsScript<VerbsOutput>("verbs.ps1", { target: t.path }, { workDir: ctx.workDir, timeoutMs: 60000, collector: ID });
    if (!r.ok) return { evidence: [], limitations: [r.limitation] };
    const evidence: Evidence[] = [];
    for (const v of asArray(r.data.verbs)) {
      const argv = splitTemplate(v.template);
      evidence.push({
        id: `${ID}:shell-verb:${v.progId}:${v.verb}`,
        source: ID,
        kind: "shell-verb",
        payload: { ...v, extensions: asArray(v.extensions), argv },
        confidence: 0.8,
        locator: { file: t.path, registryKey: `HKCR\\${v.progId}\\shell\\${v.verb}\\command` },
        invoke: [{ via: "cli", argv }, { via: "shell", verb: v.verb }],
      });
    }
    for (const p of asArray(r.data.protocols)) {
      const argv = splitTemplate(p.template);
      evidence.push({
        id: `${ID}:url-protocol:${p.scheme}`,
        source: ID,
        kind: "url-protocol",
        payload: { ...p, argv },
        confidence: 0.8,
        locator: { file: t.path, registryKey: `HKCR\\${p.scheme}` },
        invoke: [{ via: "shell", verb: "open" }, { via: "cli", argv }],
      });
    }
    for (const a of asArray(r.data.appPaths)) {
      evidence.push({
        id: `${ID}:cli-arg:app-paths:${a.name}`,
        source: ID,
        kind: "cli-arg",
        payload: { source: "App Paths", template: a.template, argv: [a.name] },
        confidence: 0.8,
        locator: { file: t.path, registryKey: `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${a.name}` },
        invoke: [{ via: "cli", argv: [a.name] }],
      });
    }
    return { evidence, limitations: [] };
  },
};

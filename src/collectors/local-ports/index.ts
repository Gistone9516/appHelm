// 수집원 local-ports: 실행 중인 대상 프로세스가 열어 둔 TCP 포트. 연결은 하지 않는다 (IF-19)
import type { Collector, CollectorContext, Evidence, Target } from "../../core/types.ts";
import { asArray, runPsScript } from "../../ps/runner.ts";

const ID = "local-ports";

interface PortsOutput {
  running: boolean;
  pids: number[];
  ports: { pid: number; address: string; port: number }[];
}

export const localPorts: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => !!t.pe && !t.pe.isDll,
  async collect(t: Target, ctx: CollectorContext) {
    const r = await runPsScript<PortsOutput>("ports.ps1", { target: t.path }, { workDir: ctx.workDir, timeoutMs: 30000, collector: ID });
    if (!r.ok) return { evidence: [], limitations: [r.limitation] };
    if (!r.data.running) {
      return { evidence: [], limitations: [{ code: "E_NOT_APPLICABLE", collector: ID, message: "대상이 실행 중이 아니라 열린 포트를 확인하지 않았습니다." }] };
    }
    const evidence: Evidence[] = asArray(r.data.ports).map((p) => ({
      id: `${ID}:listen-port:${p.address}:${p.port}`,
      source: ID,
      kind: "listen-port",
      payload: p,
      confidence: 0.8,
      locator: { file: t.path, url: `tcp://${p.address}:${p.port}` },
    }));
    return { evidence, limitations: [] };
  },
};

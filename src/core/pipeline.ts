// 판별 → 수집 → 병합 순서만 담당한다. 실제 구현은 cli에서 주입한다 (IF-3).
import { denyReason } from "./policy.ts";
import type { Collector, CollectorContext, Evidence, Limitation, OperationDoc, Target } from "./types.ts";

export interface PipelineDeps {
  probe(input: string): Promise<{ target: Target | null; limitations: Limitation[] }>;
  collectors: Collector[];
  merge(target: Target, evidence: Evidence[], limitations: Limitation[], provenance: OperationDoc["provenance"]): OperationDoc;
}

export async function mapProgram(input: string, ctx: CollectorContext, deps: PipelineDeps): Promise<OperationDoc | { error: Limitation[] }> {
  const probed = await deps.probe(input);
  if (!probed.target) return { error: probed.limitations };
  const target = probed.target;

  const evidence: Evidence[] = [];
  const limitations: Limitation[] = [...probed.limitations];
  const provenance: OperationDoc["provenance"] = { collectorsRun: [] };

  const runnable: Collector[] = [];
  for (const c of deps.collectors) {
    if (!c.appliesTo(target)) continue;
    const denied = denyReason(c, ctx.allow);
    if (denied) limitations.push(denied);
    else runnable.push(c);
  }

  // 수집원은 서로 독립이라 동시에 돌린다. 결과는 수집원 목록 순서대로 붙여 문서 순서를 고정한다.
  const results = await Promise.all(
    runnable.map(async (c) => {
      const t0 = Date.now();
      try {
        return { c, r: await c.collect(target, ctx), ms: Date.now() - t0 };
      } catch (e) {
        // IF-1 위반이지만 문서 전체를 잃지 않도록 여기서 한 번 더 막는다
        const lim: Limitation = { code: "E_PARSE", collector: c.id, message: `수집 중 예기치 않은 오류: ${(e as Error).message}` };
        return { c, r: { evidence: [], limitations: [lim] }, ms: Date.now() - t0 };
      }
    }),
  );
  for (const { c, r, ms } of results) {
    evidence.push(...r.evidence);
    limitations.push(...r.limitations);
    provenance.collectorsRun.push({ id: c.id, ms, evidence: r.evidence.length });
  }
  return deps.merge(target, evidence, limitations, provenance);
}

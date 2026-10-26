// 수집원 uia-snapshot: 실행 중인 대상 창의 UI Automation 트리 (IF-20). 사용자 세션에서 실행한다 (IF-14)
import type { Collector, CollectorContext, Limitation, LiveUi, Target } from "../../core/types.ts";
import { asArray } from "../../ps/runner.ts";
import { runInUserSession } from "../../session/index.ts";

const ID = "uia-snapshot";
export const UIA_LIMITS = { maxDepth: 6, maxElements: 400, timeoutMs: 15000 };

interface UiaOutput extends LiveUi {
  running: boolean;
  session: number;
}

export const uiaSnapshot: Collector = {
  id: ID,
  sideEffect: "attaches-running",
  appliesTo: (t: Target) => !!t.pe && !t.pe.isDll,
  async collect(t: Target, ctx: CollectorContext) {
    const r = await runInUserSession<UiaOutput>("uia.ps1", { target: t.path, ...UIA_LIMITS }, { workDir: ctx.workDir, timeoutMs: UIA_LIMITS.timeoutMs + 20000, collector: ID });
    if (!r.ok) return { evidence: [], limitations: [r.limitation] };
    if (!r.data.running) {
      return {
        evidence: [],
        limitations: [{ code: "E_NOT_APPLICABLE", collector: ID, message: "대상이 실행 중이 아니라 화면 요소를 읽지 않았습니다.", hint: "프로그램을 먼저 실행해 두고 --live로 다시 실행하세요." }],
      };
    }
    if (r.data.session === 0) {
      return { evidence: [], limitations: [{ code: "E_ACCESS_DENIED", collector: ID, message: "서비스 세션(Session 0)에서 실행되어 화면을 볼 수 없었습니다." }] };
    }
    const live: LiveUi = {
      windows: asArray(r.data.windows),
      elements: asArray(r.data.elements).map((e) => ({ ...e, patterns: asArray(e.patterns) })),
      truncated: !!r.data.truncated,
    };
    const minimized = asArray(r.data.minimized);
    if (minimized.length) live.minimized = minimized;
    const limitations: Limitation[] = live.truncated
      ? [{ code: "E_OUTPUT_TOO_LARGE", collector: ID, message: `화면 요소가 많아 ${live.elements.length}개(깊이 ${UIA_LIMITS.maxDepth})까지만 읽었습니다.` }]
      : [];
    // IF-20, F-30: 최소화된 창은 요소가 껍데기만 보인다. 창 상태는 바꾸지 않고 알리기만 한다
    if (minimized.length) {
      limitations.push({ code: "E_NOT_APPLICABLE", collector: ID, message: `최소화된 창 ${minimized.length}개는 화면 요소가 일부만 보입니다.`, hint: "창을 복원한 뒤 --live로 다시 읽으세요." });
    }
    return {
      evidence: [{ id: `${ID}:ui-element:${t.path}`, source: ID, kind: "ui-element", payload: live as unknown as Record<string, unknown>, confidence: 0.9, locator: { file: t.path } }],
      limitations,
    };
  },
};

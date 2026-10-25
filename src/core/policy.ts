// IF-2: 부작용 허용 판정은 이 파일 한 곳에서만 한다.
import type { Collector, CollectorContext, Limitation } from "./types.ts";

/** 실행해도 되면 null, 아니면 건너뛴 이유를 돌려준다. */
export function denyReason(c: Collector, allow: CollectorContext["allow"]): Limitation | null {
  if (c.sideEffect === "launches-target" && !allow.launch) {
    return {
      code: "E_OPT_IN_REQUIRED",
      collector: c.id,
      message: "대상 프로그램을 실행해야 하는 수집이라 건너뛰었습니다.",
      hint: "--allow-launch를 붙이면 실행합니다.",
    };
  }
  if (c.sideEffect === "attaches-running" && !allow.live) {
    return {
      code: "E_OPT_IN_REQUIRED",
      collector: c.id,
      message: "실행 중인 프로그램에 붙어야 하는 수집이라 건너뛰었습니다.",
      hint: "--live를 붙이면 실행합니다.",
    };
  }
  return null;
}

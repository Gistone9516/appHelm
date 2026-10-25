// 5차: 네이티브 동작 추적 (옵트인). Ghidra가 있을 때만 REA 네이티브 공급자로 돌린다.
// 느리고(콜드 스타트 수백 초) 실험적이라 일반 map에는 넣지 않고 별도 명령/도구로만 노출한다.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Limitation } from "../core/types.ts";
import { createReaRunner } from "../rea-bridge/runner.ts";
import { detectGhidra, ghidraEnv } from "../rea-bridge/ghidra.ts";

export interface NativeTrace {
  target: string;
  image: { imageBase?: string; segments: unknown[]; procedureCount?: number; stringCount?: number };
  procedures?: { query: string; matches: unknown[] };
  limitations: Limitation[];
}

export type TraceResult = { ok: true; trace: NativeTrace } | { ok: false; limitation: Limitation };

function norm(json: unknown): unknown {
  const n = (json as { normalized_result?: unknown }).normalized_result;
  return n ?? json;
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 대상 실행 파일의 이미지 개요(세그먼트·함수·문자열 수)와, query가 있으면 이름 검색 결과를 돌려준다. */
export async function runNativeTrace(target: string, opts: { query?: string; log?: (m: string) => void; timeoutMs?: number }): Promise<TraceResult> {
  const cfg = detectGhidra();
  if (!cfg) {
    return {
      ok: false,
      limitation: {
        code: "E_OPT_IN_REQUIRED",
        collector: "native-trace",
        message: "Ghidra/JDK를 찾지 못해 네이티브 추적을 할 수 없습니다.",
        hint: "GHIDRA_INSTALL_DIR와 JAVA_HOME을 설정하거나 C:\\tools\\ghidra_12.1.4_PUBLIC, C:\\tools\\jdk-21에 설치하세요.",
      },
    };
  }
  const workDir = join(tmpdir(), "apphelm");
  mkdirSync(workDir, { recursive: true });
  const timeoutMs = opts.timeoutMs ?? 900000;
  const log = opts.log ?? (() => {});
  const rea = createReaRunner({ workDir, timeoutMs, log, env: ghidraEnv(cfg, timeoutMs) });

  const limitations: Limitation[] = [];
  const ins = await rea.run("inspect", [target, "--provider", "ghidra"]);
  if (!ins.ok) return { ok: false, limitation: { ...ins.limitation, collector: "native-trace" } };
  const n = asObj(norm(ins.json));
  const image: NativeTrace["image"] = {
    imageBase: n.image_base as string | undefined,
    segments: Array.isArray(n.segments) ? n.segments : [],
    procedureCount: n.procedure_count as number | undefined,
    stringCount: n.string_count as number | undefined,
  };

  const trace: NativeTrace = { target, image, limitations };
  if (opts.query) {
    const sr = await rea.run("search", [target, opts.query, "--kind", "procedures", "--provider", "ghidra"]);
    if (sr.ok) {
      // rea search의 normalized_result는 {address, value} 배열 자체다 (원시 출력 확인 2026-10-25)
      const sn = norm(sr.json);
      const matches = Array.isArray(sn) ? sn : ((asObj(sn).procedures ?? asObj(sn).matches ?? asObj(sn).results ?? []) as unknown[]);
      trace.procedures = { query: opts.query, matches: Array.isArray(matches) ? matches : [] };
    } else {
      limitations.push({ ...sr.limitation, collector: "native-trace" });
    }
  }
  return { ok: true, trace };
}

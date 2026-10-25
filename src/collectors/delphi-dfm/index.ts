// 수집원 delphi-dfm: Delphi 이진 폼(RCDATA의 TPF0)을 해석한다 (IF-23)
import { readFileSync } from "node:fs";
import type { Collector, CollectorContext, Evidence, FormDoc, Limitation, Target } from "../../core/types.ts";
import { decodeDfm } from "../../decoders/dfm.ts";
import { parsePeResourcesJson, type ResourceEntry } from "../../rea-bridge/peResources.ts";

const ID = "delphi-dfm";
const RT_RCDATA = 10;
const TPF0 = [0x54, 0x50, 0x46, 0x30]; // "TPF0"

function ansiDecoder(lang: string): TextDecoder {
  const enc = lang.toLowerCase().startsWith("ko") ? "euc-kr" : "windows-1252";
  try {
    return new TextDecoder(enc);
  } catch {
    return new TextDecoder("windows-1252");
  }
}

export const delphiDfm: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => t.family === "delphi",
  async collect(t: Target, ctx: CollectorContext) {
    const r = await ctx.rea.run("inspect-pe-resources", [t.path]);
    if (!r.ok) return { evidence: [], limitations: [{ ...r.limitation, collector: ID }] };
    let entries: ResourceEntry[];
    try {
      entries = parsePeResourcesJson(r.json).filter((e) => e.type === RT_RCDATA);
    } catch (e) {
      return { evidence: [], limitations: [{ code: "E_PARSE", collector: ID, message: `리소스 목록을 읽지 못했습니다: ${(e as Error).message}` }] };
    }
    const buf = new Uint8Array(readFileSync(t.path));
    const ansi = ansiDecoder(ctx.lang);
    const evidence: Evidence[] = [];
    const limitations: Limitation[] = [];
    let forms = 0;
    for (const e of entries) {
      const slice = buf.subarray(e.offset, e.offset + e.bytes);
      if (!TPF0.every((b, i) => slice[i] === b)) continue; // TPF0로 시작하는 RCDATA만 폼이다
      forms++;
      try {
        const form: FormDoc = { framework: "delphi-vcl", ...decodeDfm(slice, ansi) };
        evidence.push({
          id: `${ID}:form:${e.name}`,
          source: ID,
          kind: "form",
          payload: form as unknown as Record<string, unknown>,
          confidence: 0.85,
          locator: { file: t.path, resource: { type: RT_RCDATA, name: e.name, ...(e.lang !== null ? { lang: e.lang } : {}) }, offset: e.offset },
        });
      } catch (err) {
        limitations.push({ code: "E_PARSE", collector: ID, message: `DFM ${e.name} 해석 실패: ${(err as Error).message}` });
      }
    }
    if (forms === 0) limitations.push({ code: "E_NOT_APPLICABLE", collector: ID, message: "TPF0 폼 리소스를 찾지 못했습니다." });
    return { evidence, limitations };
  },
};

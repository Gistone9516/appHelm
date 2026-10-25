// 수집원 com-typelib: 대상이 제공하는 COM 서버와 TypeLib의 메서드·속성 (IF-17)
import type { Collector, CollectorContext, ComInterfaceDoc, ComServerDoc, Evidence, Limitation, Target } from "../../core/types.ts";
import { asArray, runPsScript } from "../../ps/runner.ts";

const ID = "com-typelib";
const MAX_MEMBERS = 3000;

interface ComOutput {
  servers: { clsid: string; progId?: string; server: "local" | "inproc"; typeLib?: string }[];
  typeLibs: Record<string, ComInterfaceDoc[]>;
  errors: string[];
}

/** 같은 TypeLib을 쓰는 서버가 여럿이면 인터페이스는 첫 서버에만 담는다 (문서 중복 방지). */
type RawInterface = ComInterfaceDoc & { hidden?: boolean };

/** IF-17: 숨김 형식은 숨기지 않은 coclass가 구현 인터페이스로 가리킬 때만 남긴다. */
export function normalizeInterfaces(list: unknown): ComInterfaceDoc[] {
  const raw = asArray(list as RawInterface[]).map((i) => ({
    ...i,
    members: asArray(i.members).map((m) => ({ ...m, params: asArray(m.params) })),
    ...(i.implements !== undefined ? { implements: asArray(i.implements) } : {}),
  }));
  const referenced = new Set(raw.filter((i) => i.kind === "coclass" && !i.hidden).flatMap((i) => i.implements ?? []));
  return raw
    .filter((i) => !i.hidden || (i.kind !== "coclass" && referenced.has(i.name)))
    .map(({ hidden: _hidden, ...rest }) => rest);
}

export function toServerDocs(out: ComOutput): ComServerDoc[] {
  const used = new Set<string>();
  return asArray(out.servers).map((s) => {
    const doc: ComServerDoc = { clsid: s.clsid, server: s.server, interfaces: [] };
    if (s.progId) doc.progId = s.progId;
    if (s.typeLib) {
      doc.typeLib = s.typeLib;
      if (!used.has(s.typeLib)) {
        used.add(s.typeLib);
        doc.interfaces = normalizeInterfaces(out.typeLibs?.[s.typeLib]).filter((i) => i.kind === "coclass" || i.members.length > 0);
      }
    }
    return doc;
  });
}

export const comTypelib: Collector = {
  id: ID,
  sideEffect: "reads-registry",
  appliesTo: (t: Target) => !!t.pe,
  async collect(t: Target, ctx: CollectorContext) {
    const r = await runPsScript<ComOutput>("com.ps1", { target: t.path, maxMembers: MAX_MEMBERS }, { workDir: ctx.workDir, timeoutMs: 90000, collector: ID });
    if (!r.ok) return { evidence: [], limitations: [r.limitation] };
    const limitations: Limitation[] = asArray(r.data.errors).map((e) => ({ code: "E_PARSE" as const, collector: ID, message: `TypeLib을 읽지 못했습니다: ${e}` }));
    const evidence: Evidence[] = toServerDocs(r.data).map((d) => ({
      id: `${ID}:com-server:${d.clsid}`,
      source: ID,
      kind: "com-server",
      payload: d as unknown as Record<string, unknown>,
      confidence: 0.9,
      locator: { file: d.typeLib ?? t.path, registryKey: `HKCR\\CLSID\\${d.clsid}` },
    }));
    const members = evidence.reduce((s, e) => s + ((e.payload as unknown as ComServerDoc).interfaces ?? []).reduce((a, i) => a + i.members.length, 0), 0);
    if (members >= MAX_MEMBERS) limitations.push({ code: "E_OUTPUT_TOO_LARGE", collector: ID, message: `COM 멤버가 많아 ${MAX_MEMBERS}개까지만 담았습니다.` });
    return { evidence, limitations };
  },
};

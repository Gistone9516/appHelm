// 수집원 dotnet: .NET WinForms 폼을 REA managed-members 출력에서 추정한다 (IF-22)
import type { Collector, CollectorContext, Evidence, FormControl, FormDoc, Limitation, Target } from "../../core/types.ts";
import { asArray } from "../../ps/runner.ts";

const ID = "dotnet";

interface ManagedMethod {
  token: string;
  declaring_type: string;
  name: string;
  signature: { parameter_count: number | null };
}
interface ManagedField {
  name: string;
  declaring_type: string;
  signature: { field_type: string | null };
}
interface CallEdge {
  caller_token: string;
  caller: string;
  opcode: string;
  target_name: string;
  target_declaring_type: string;
}
interface FieldAccess {
  method_token: string;
  opcode: string;
  field_name: string;
  field_declaring_type: string;
}
interface Managed {
  types?: { full_name: string }[];
  methods?: ManagedMethod[];
  fields?: ManagedField[];
  call_edges?: CallEdge[];
  field_accesses?: FieldAccess[];
  user_strings?: { literals?: { value: string }[] };
}

const shortName = (full: string) => full.split(".").pop() ?? full;

/** InitializeComponent의 호출·필드 대입 순서를 짝지어, 각 필드 컨트롤의 종류·처리기·글자를 추정한다. */
export function formsFromManaged(m: Managed): FormDoc[] {
  const methods = asArray(m.methods);
  const fields = asArray(m.fields);
  const edges = asArray(m.call_edges);
  const accesses = asArray(m.field_accesses);
  const literals = asArray(m.user_strings?.literals).map((l) => l.value);

  const initMethods = methods.filter((x) => x.name === "InitializeComponent");
  const forms: FormDoc[] = [];

  for (const init of initMethods) {
    const type = init.declaring_type;
    const typeFields = fields.filter((f) => f.declaring_type === type);
    const fieldType = new Map(typeFields.map((f) => [f.name, f.signature.field_type]));
    const controls = new Map<string, FormControl>();
    for (const f of typeFields) controls.set(f.name, { name: f.name, handlers: [] });

    // InitializeComponent 안에서 호출·필드 접근을 순서대로 본다
    const initEdges = edges.filter((e) => e.caller_token === init.token);
    const initAccess = accesses.filter((a) => a.method_token === init.token && a.opcode.startsWith("stfld"));

    // newobj → 다음 stfld 필드: 그 필드의 컨트롤 종류
    let pendingClass: string | null = null;
    // 전체 IC 순서를 합쳐 보려면 오프셋이 필요하나 REA가 주지 않으므로(F-13),
    // edges와 accesses를 각각의 순서로 훑으며 newobj 바로 뒤 stfld를 짝짓는다.
    const merged: { kind: "new" | "set" | "handler" | "prop"; value: string }[] = [];
    for (const e of initEdges) {
      if (e.opcode === "newobj") merged.push({ kind: "new", value: e.target_declaring_type });
      else if (e.opcode.startsWith("call") && e.target_name.startsWith("set_")) merged.push({ kind: "prop", value: `${e.target_name}` });
      else if (e.opcode.startsWith("call") && e.target_name.startsWith("add_")) merged.push({ kind: "handler", value: e.target_name });
    }
    // stfld는 별도 순서라 완전 병합은 불가. newobj 개수와 stfld 개수가 같으면 순서대로 대응한다.
    const newobjs = initEdges.filter((e) => e.opcode === "newobj");
    if (newobjs.length === initAccess.length) {
      for (let i = 0; i < newobjs.length; i++) {
        const ctrl = controls.get(initAccess[i]!.field_name);
        if (ctrl) ctrl.className = shortName(newobjs[i]!.target_declaring_type);
      }
    }
    void pendingClass;
    void merged;

    // 처리기: 매개변수 2개짜리 <필드>_<이벤트> 메서드
    const handlerMethods = methods.filter((x) => x.declaring_type === type && x.signature.parameter_count === 2 && x.name.includes("_"));
    for (const h of handlerMethods) {
      const us = h.name.lastIndexOf("_");
      const field = h.name.slice(0, us);
      const event = h.name.slice(us + 1);
      const ctrl = controls.get(field);
      if (ctrl) ctrl.handlers.push({ event, method: h.name });
    }

    // 글자: 리터럴 순서에서 필드 이름 다음에 나오는 첫 글자
    for (let i = 0; i < literals.length; i++) {
      const ctrl = controls.get(literals[i]!);
      if (ctrl && i + 1 < literals.length && !fieldType.has(literals[i + 1]!)) ctrl.text = literals[i + 1];
    }

    forms.push({ framework: "winforms", className: type, controls: [...controls.values()].filter((c) => c.className || c.handlers.length || c.text) });
  }
  return forms;
}

export const dotnet: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => t.family === "dotnet",
  async collect(t: Target, ctx: CollectorContext) {
    const r = await ctx.rea.run("inspect-managed-members", [t.path]);
    if (!r.ok) return { evidence: [], limitations: [{ ...r.limitation, collector: ID }] };
    const m = (r.json as { normalized_result?: Managed }).normalized_result;
    if (!m) return { evidence: [], limitations: [{ code: "E_PARSE", collector: ID, message: ".NET 메타데이터를 읽지 못했습니다." }] };
    const forms = formsFromManaged(m);
    const limitations: Limitation[] = [];
    if (forms.length === 0) limitations.push({ code: "E_NOT_APPLICABLE", collector: ID, message: "InitializeComponent를 가진 WinForms 폼을 찾지 못했습니다. WPF(XAML)는 아직 해석하지 않습니다." });
    const evidence: Evidence[] = forms.map((f) => ({
      id: `${ID}:form:${f.className}`,
      source: ID,
      kind: "form",
      payload: f as unknown as Record<string, unknown>,
      confidence: 0.5,
      locator: { file: t.path },
    }));
    return { evidence, limitations };
  },
};

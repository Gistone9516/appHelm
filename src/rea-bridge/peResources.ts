// REA inspect-pe-resources 출력(F-3)을 리소스 위치 목록으로 바꾼다.

export interface ResourceEntry {
  type: number | string;
  name: number | string;
  lang: number | null;
  offset: number;
  bytes: number;
}

type IdOrName = { kind: "id"; id: number } | { kind: "name"; name: string };

function idOf(v: unknown): number | string | null {
  const x = v as IdOrName | undefined;
  if (!x || typeof x !== "object") return null;
  if (x.kind === "id" && typeof x.id === "number") return x.id;
  if (x.kind === "name" && typeof x.name === "string") return x.name;
  return null;
}

export function parsePeResourcesJson(json: unknown): ResourceEntry[] {
  const nr = (json as { normalized_result?: { resources?: unknown[] } })?.normalized_result;
  if (!nr || !Array.isArray(nr.resources)) throw new Error("normalized_result.resources가 없습니다");
  const out: ResourceEntry[] = [];
  for (const r of nr.resources) {
    const row = r as { type?: unknown; name?: unknown; language?: unknown; payload?: { location?: { offset?: number; bytes?: number } } };
    const type = idOf(row.type);
    const name = idOf(row.name);
    const lang = idOf(row.language);
    const loc = row.payload?.location;
    if (type === null || name === null || typeof loc?.offset !== "number" || typeof loc?.bytes !== "number") continue;
    out.push({ type, name, lang: typeof lang === "number" ? lang : null, offset: loc.offset, bytes: loc.bytes });
  }
  return out;
}

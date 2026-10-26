// 수집원 qt-resources: exe 안의 Qt 리소스에서 QML을 꺼내 단축키와 라벨을 읽는다 (IF-36)
import { readFileSync } from "node:fs";
import type { Collector, Evidence, FormControl, FormDoc, Limitation, Target } from "../../core/types.ts";
import { readQml } from "../../decoders/qml.ts";
import { QRC_LIMITS, readQrc } from "../../decoders/qrc.ts";

const ID = "qt-resources";
const QT_TOOLKITS = new Set(["qt5", "qt6"]);

export const qtResources: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => !!t.toolkits?.some((k) => QT_TOOLKITS.has(k.id)),
  async collect(t: Target) {
    let qrc;
    try {
      qrc = readQrc(new Uint8Array(readFileSync(t.path)));
    } catch (e) {
      return { evidence: [], limitations: [{ code: "E_PARSE", collector: ID, message: `Qt 리소스를 읽지 못했습니다: ${(e as Error).message}` }] };
    }
    const limitations: Limitation[] = [];
    if (qrc.truncated) {
      limitations.push({ code: "E_OUTPUT_TOO_LARGE", collector: ID, message: `Qt 리소스가 커서 일부만 읽었습니다 (나무 ${QRC_LIMITS.maxTrees}개, 파일 ${QRC_LIMITS.maxFiles}개, ${QRC_LIMITS.maxInflatedBytes / 1048576}MB 상한).` });
    }
    if (qrc.skippedZstd) {
      limitations.push({ code: "E_UNSUPPORTED_FORMAT", collector: ID, message: `zstd로 압축된 Qt 리소스 ${qrc.skippedZstd}개는 읽지 않았습니다.` });
    }
    const forms: FormDoc[] = [];
    const utf8 = new TextDecoder("utf-8");
    for (const f of qrc.files) {
      if (!f.data || !f.path.endsWith(".qml")) continue;
      const info = readQml(utf8.decode(f.data));
      if (!info.shortcuts.length && !info.labels.length) continue;
      const type = f.path.slice(f.path.lastIndexOf("/") + 1, -".qml".length);
      const controls: FormControl[] = info.shortcuts.map((s) => ({
        name: `Shortcut ${s.keys}`,
        className: "Shortcut",
        text: s.handler || undefined,
        shortcut: s.keys,
        handlers: s.handler ? [{ event: "onActivated", method: s.handler }] : [],
      }));
      forms.push({ framework: "qml", className: type, title: info.labels[0], controls, source: f.path, labels: info.labels });
    }
    if (!forms.length) {
      return { evidence: [], limitations: [...limitations, { code: "E_NOT_APPLICABLE", collector: ID, message: `Qt 리소스에서 QML을 찾지 못했습니다 (파일 ${qrc.files.length}개).` }] };
    }
    // 단축키가 있는 화면을 앞에 둔다. Markdown은 앞의 폼 몇 개만 보여 준다 (IF-13)
    forms.sort((a, b) => b.controls.length - a.controls.length || a.source!.localeCompare(b.source!));
    const evidence: Evidence[] = forms.map((form) => ({
      id: `${ID}:form:${form.source}`,
      source: ID,
      kind: "form",
      payload: form as unknown as Record<string, unknown>,
      confidence: 0.8,
      locator: { file: t.path },
    }));
    return { evidence, limitations };
  },
};

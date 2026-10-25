// 수집원 pe-imports: import 함수 이름으로 프로그램이 할 수 있는 일을 추정한다 (IF-8)
import { readFileSync } from "node:fs";
import type { Collector, Evidence, Target } from "../../core/types.ts";
import { parsePe, readImports, type ImportedDll } from "../../pe/pe.ts";

const ID = "pe-imports";

// [능력 이름, 함수 이름 패턴]. Windows 10은 api-ms-win-* 같은 API 세트 DLL을 쓰므로 DLL 이름이 아니라 함수 이름으로 판정한다.
export const CAPABILITY_RULES: [string, RegExp][] = [
  ["클립보드", /^(OpenClipboard|GetClipboardData|SetClipboardData)$/],
  ["파일 열기·저장 대화상자", /^(GetOpenFileName|GetSaveFileName)[AW]?$/],
  ["인쇄", /^(PrintDlg(Ex)?[AW]?|PageSetupDlg[AW]?|StartDoc[AW]?|OpenPrinter[AW2]*)$/],
  ["찾기·바꾸기 대화상자", /^(FindText|ReplaceText)[AW]?$/],
  ["글꼴 선택 대화상자", /^ChooseFont[AW]?$/],
  ["색 선택 대화상자", /^ChooseColor[AW]?$/],
  ["레지스트리 읽기·쓰기", /^Reg(OpenKey|CreateKey|SetValue|QueryValue|GetValue)/],
  ["HTTP 통신", /^(WinHttp|InternetOpen|HttpOpenRequest|HttpSendRequest|URLDownloadToFile)/],
  ["소켓 통신", /^(WSAStartup|WSASocket[AW]?|socket|connect|bind|listen)$/],
  ["COM 객체 사용", /^(CoCreateInstance(Ex)?|CoGetClassObject)$/],
  ["COM 서버 제공 (자동화 노출 가능성)", /^(CoRegisterClassObject|RegisterActiveObject)$/],
  ["다른 프로그램·문서 실행", /^(ShellExecute(Ex)?[AW]?|CreateProcess[AW]?)$/],
  ["파일 끌어다 놓기", /^(DragAcceptFiles|RegisterDragDrop|DragQueryFile[AW]?)$/],
  ["전역 단축키", /^RegisterHotKey$/],
  ["창 메시지로 다른 프로그램과 통신", /^(RegisterWindowMessage[AW]?|FindWindow(Ex)?[AW]?)$/],
  ["명명된 파이프 통신", /^(CreateNamedPipe[AW]?|ConnectNamedPipe|CallNamedPipe[AW]?)$/],
  ["공유 메모리", /^(CreateFileMapping[AW2]?|OpenFileMapping[AW]?)$/],
  ["DDE 통신", /^Dde(Initialize|Connect|ClientTransaction)/],
  ["알림 영역 아이콘", /^Shell_NotifyIcon[AW]?$/],
  ["명령줄 인자 사용", /^(GetCommandLine[AW]?|CommandLineToArgvW)$/],
  ["UI Automation 제공", /^(UiaReturnRawElementProvider|UiaHostProviderFromHwnd)$/],
];

export function capabilitiesOf(imports: ImportedDll[]): { capability: string; functions: string[] }[] {
  const out: { capability: string; functions: string[] }[] = [];
  for (const [capability, re] of CAPABILITY_RULES) {
    const fns = new Set<string>();
    for (const d of imports) for (const f of d.functions) if (re.test(f)) fns.add(f);
    if (fns.size) out.push({ capability, functions: [...fns].sort() });
  }
  return out;
}

export const peImports: Collector = {
  id: ID,
  sideEffect: "none",
  appliesTo: (t: Target) => !!t.pe,
  async collect(t: Target) {
    try {
      const imports = readImports(parsePe(new Uint8Array(readFileSync(t.path))));
      const evidence: Evidence[] = capabilitiesOf(imports).map((c) => ({
        id: `${ID}:import-capability:${c.capability}`,
        source: ID,
        kind: "import-capability",
        payload: c,
        confidence: 0.4,
        locator: { file: t.path },
      }));
      return { evidence, limitations: [] };
    } catch (err) {
      return { evidence: [], limitations: [{ code: "E_PARSE", collector: ID, message: `import 표를 읽지 못했습니다: ${(err as Error).message}` }] };
    }
  },
};

# AppHelm

MCP를 지원하지 않는 Windows 프로그램을 AI가 조작할 수 있도록, 프로그램의 리소스와 Windows가 드러내는 창구를 읽어 **AI가 읽는 조작 문서**를 만드는 도구. 정보 수집의 일부는 [REA](https://github.com/morluto/rea)(MIT)를 하위 엔진으로 불러 쓴다. 깊은 역공학은 하지 않는다.

## 실행

Node.js 20 이상이 필요하다. 처음 한 번 의존성을 설치한다.

```
npm install
```

그다음 명령 한 줄로 문서를 만든다.

```
node bin/apphelm.mjs map notepad
node bin/apphelm.mjs map "C:\Program Files\앱\app.exe" --out 결과폴더
node bin/apphelm.mjs map notepad --live
```

- Markdown 요약(4KB 이하)이 화면에 출력되고, `apphelm-out\<이름>.ops.md`와 전체 내용 `<이름>.ops.json`이 저장된다.
- `--live`를 붙이면 실행 중인 대상 창의 화면 요소(UI Automation)도 읽는다. 대상을 먼저 실행해 두어야 한다.
- REA 첫 실행은 패키지 다운로드 때문에 1분 정도 걸리고, 이후에는 대상 하나에 약 10초가 걸린다.
- 본인이 소유하거나 분석을 허가받은 프로그램에만 쓴다(저작권법 제101조의4).

조작(실행)과 원격:

```
# 실제 조작 (바로 실행됨)
node bin/apphelm.mjs invoke-com --progid Word.Application --attach --path "Selection.TypeText" --args "[\"안녕\"]"
node bin/apphelm.mjs invoke-window --target "C:\Windows\System32\notepad.exe" --wm 26
node bin/apphelm.mjs invoke-uia --target "C:\...\WINWORD.EXE" --name "편집 사용" --pattern Invoke

# 원격: 대상 PC에서 에이전트를 띄우고(아래), 조작하는 쪽에서 --host 로 지정
#  - 대상이 Node가 있으면:   node bin/apphelm.mjs serve
#  - 대상이 무설치면:         powershell -ExecutionPolicy Bypass -File agent\apphelm-agent.ps1 -Token <토큰>
$env:APPHELM_TOKEN="<토큰>"
node bin/apphelm.mjs map 대상.exe --host book
node bin/apphelm.mjs invoke-com --progid Word.Application --attach --path "Selection.TypeText" --args "[\"안녕\"]" --host 100.67.200.125
```

MCP 서버 (Claude Code에서 직접 호출):

```
# Claude Code에 등록 (한 번): 이 저장소 폴더에서
claude mcp add --transport stdio apphelm -- node --import tsx "F:\SUAN\2026-2\AppHelm\src\mcp\main.ts"
# 원격 조작을 쓰면 에이전트 토큰을 환경변수로:
#   claude mcp add --transport stdio --env APPHELM_TOKEN=<토큰> apphelm -- node --import tsx "<경로>\src\mcp\main.ts"
```

등록 후 Claude Code에서 `map_program`, `get_operation_doc`, `invoke_operation`, `list_hosts`를 쓸 수 있다. stdout은 JSON-RPC 전용이라 로그는 전부 stderr로 나간다.

네이티브 동작 추적 (5차, Ghidra 필요):

```
# Ghidra 12.1.4 + JDK 21 설치 후 (환경변수 GHIDRA_INSTALL_DIR·JAVA_HOME 또는 C:\tools 기본 경로)
node bin/apphelm.mjs trace "C:\경로\app.exe" --query 함수이름
```

느리다(콜드 스타트 수백 초). 네이티브 PE(x86/x64)만, .NET 등 관리 코드는 지원 안 한다. Windows Ghidra는 실험적·읽기 전용이다.

검증 명령:

```
npm run typecheck
npm run check:boundaries
npm test
npm run e2e
```

## 구조

```
_인터페이스계약.md     공유 계약 (규칙 IF-1~IF-24, 실측 사실 F-1~F-15). 코드와 충돌하면 이 문서가 이긴다
bin/apphelm.mjs    실행 진입점 (tsx로 소스를 바로 실행)
agent/apphelm-agent.ps1    무설치 원격 에이전트 (Windows 기본 PowerShell/.NET만, 대상 PC에서 직접 실행)
src/invoke/            실행 계층: com·window·uia(화면 요소 클릭/토글/값)·http·shell
src/server/            에이전트 HTTP 핸들러 (map·invoke)
src/transport/         Tailscale 노드 이름/IP 해석
src/cli/               map·invoke-*·serve 명령과 원격 클라이언트
src/core/              공유 타입, 부작용 허용 판정(IF-2), 파이프라인 (수집원 동시 실행)
src/pe/                PE 헤더·import 표 읽기, MUI 파일 탐색
src/decoders/          리소스 바이트 해석: 메뉴·단축키·문자열·버전·대화상자, Delphi DFM, Electron asar
src/rea-bridge/        REA CLI 실행(버전 6.7.0 고정)과 출력 해석
src/ps/                PowerShell 5.1 스크립트 실행기와 스크립트(scripts/*.ps1, ASCII 전용)
src/session/           화면이 필요한 스크립트를 사용자 세션에서 실행 (서비스 세션이면 1회용 예약 작업)
src/collectors/        수집원
  pe-resources/          메뉴·단축키·대화상자·문자열·버전 리소스 (네이티브)
  pe-imports/            import 기반 기능 추정
src/trace/             (5차, 옵트인) Ghidra 네이티브 동작 추적 오케스트레이션
src/rea-bridge/ghidra.ts  Ghidra/JDK 위치 감지와 REA 주입 환경 변수
  registry-verbs/        셸 동사·연결 프로그램·URL 프로토콜·App Paths
  com-typelib/           COM 서버와 TypeLib의 메서드·속성
  local-ports/           실행 중인 대상이 연 TCP 포트 (연결은 하지 않음)
  dotnet/                .NET WinForms 폼 추정 (REA managed-members)
  delphi-dfm/            Delphi 이진 폼(DFM) 해석
  electron-js/           Electron 앱 package.json과 fuse (asar에서 직접)
  uia-snapshot/          실행 중인 창의 UI Automation 요소 (--live)
src/probe/             대상 판별 (경로나 이름 → 실행 파일, 종류, MUI, Electron 위치)
src/merge/             수집 결과 → 조작 문서 (같은 명령 합치기, 이름 결정, 자동화 창구 정리)
src/render/            Markdown 요약
src/cli/               apphelm map 명령
scripts/check-boundaries.ts   폴더 간 import 규칙 검사 (IF-3)
test/unit/, test/e2e/         단위 테스트, 실제 Windows 앱 테스트
```

## 설계 핵심

- **REA는 리소스 위치만 찾고, 해석은 어댑터가 한다 (IF-6).** REA CLI는 리소스 내용을 해석하지 않고, import 명령도 없다(F-3, F-4). 같은 일을 두 곳에서 구현하지 않으려고 PE 리소스 디렉터리는 REA만 읽는다.
- **MUI 파일을 따라간다 (IF-7).** Windows 기본 앱의 메뉴는 `ko-KR\notepad.exe.mui` 같은 별도 파일에 있다. 이걸 안 보면 메뉴가 통째로 빠진다.
- **같은 명령은 하나의 작업으로 합친다 (IF-10, IF-15).** 메뉴 항목과 단축키를 명령 ID로 묶는다. 단축키 표끼리 같은 키를 다른 명령에 연결하면, 소수 쪽 표를 특정 모드용으로 분류해 기본 단축키에서 뺀다. 메모장의 SLIPUPACC 표가 Ctrl+C를 "끝내기"에 연결하고 있어서 생긴 규칙이다.
- **COM은 서버의 기본 인터페이스를 앞세운다 (IF-17).** 서버 CLSID와 같은 coclass의 기본 인터페이스에서 예시 멤버를 뽑는다. 숨김 형식도 coclass가 가리키면 남긴다. IE의 IWebBrowser2가 `hidden`이라 일괄 제외하면 핵심 인터페이스가 빠졌다(F-12).
- **런타임마다 UI 정의가 있는 곳이 다르다 (IF-22~IF-24).** .NET은 `InitializeComponent`의 호출·필드 순서로 폼을 추정하고(REA가 IL 오프셋을 안 줘서 추정이므로 신뢰도 0.5, F-13), Delphi는 RCDATA의 이진 폼(TPF0)을 직접 해석하며, Electron은 asar에서 package.json과 fuse만 읽는다. 전체 JS 분석은 느리고 출력이 커서(F-15) 하지 않는다.
- **화면 수집은 사용자 세션에서 한다 (IF-14, IF-20).** 서비스 세션(Session 0)에서는 창이 보이지 않는다(F-7). 그래서 1회용 예약 작업으로 사용자 세션에서 스크립트를 돌리고, 끝나면 작업을 지운다.
- **PowerShell과는 파일로 주고받는다 (IF-21).** 스크립트는 ASCII만 쓰고, 입출력은 UTF-8 JSON 파일이다. PowerShell 5.1이 원소 1개 배열을 값으로 풀어 버리므로(F-11), 배열은 TypeScript 경계에서 `asArray()`로 맞춘다.
- **수집원은 실패해도 예외를 던지지 않는다 (IF-1).** 일부가 실패해도 나머지 결과로 문서를 만들고, 실패는 "한계"에 적는다.
- **대상 프로그램을 실행하거나 붙는 수집은 플래그가 있어야 한다 (IF-2).** 판정은 `src/core/policy.ts` 한 곳에서만 한다.

## 현재 상태

- 1차 사이클 완료: 네이티브 exe의 메뉴, 단축키, 대화상자, 버전, import 기반 기능. 메모장, 레지스트리 편집기, 그림판으로 검증했다.
- 2차 사이클 완료: 셸 동사·URL 프로토콜·명령줄, COM TypeLib, 열린 포트, 사용자 세션의 UIA. 메모장, Internet Explorer(COM), 탐색기(UIA)로 검증했다.
- 3차 사이클 완료: .NET WinForms 폼, Delphi DFM, Electron(package.json·fuse). 직접 빌드한 WinForms 앱, Git 설치 제거기(Delphi), Discord(Electron)로 검증했다.
- 4차 완료:
  - 실행 계층(COM·창·UIA·HTTP), Tailscale 에이전트 전송(serve/무설치 PowerShell 에이전트/--host). **원격 노드에서 실제 앱 조작을 검증** — 노트북(.125)의 Word에 Tailscale로 붙어 UIA로 "편집 사용"을 누르고 COM으로 문장을 입력한 뒤 되읽어 확인(2026-10-25).
  - **MCP 서버**(`src/mcp/`, 의존성 0 stdio JSON-RPC): 도구 `list_hosts`·`map_program`·`get_operation_doc`·`invoke_operation`·`trace_native`. Claude Code가 직접 호출해 원격 PC 앱까지 조작. JSON-RPC 왕복(initialize·tools/list·tools/call) 검증 완료.
- 5차 완료(옵트인): Ghidra 네이티브 동작 추적 티어. `apphelm trace <exe> [--query 함수]`와 MCP `trace_native`. Ghidra 12.1.4 + JDK 21(`C:\tools`) 설치, 메모장을 REA Ghidra 공급자로 분석(세그먼트·함수 794·문자열 557, 콜드 스타트 ~180초) 검증. 일반 `map`에는 넣지 않는다(느리고 실험적, 네이티브 PE만).
- 원격 조작 메모: Tailscale은 연결만 준다. 조작은 대상 PC 안의 에이전트가 로컬로 실행한다. SSH·WinRM이 닫혀 있어 에이전트는 대상 PC에서 직접 실행해야 한다(무설치 `agent/apphelm-agent.ps1`). 에이전트는 토큰이 있어야 응답하고 loopback·Tailscale 주소에만 바인딩한다.
  - **배포 시 반드시 `_인터페이스계약.md` §5 체크리스트**를 따른다(실패 원인 F-16~F-22). 핵심: 에이전트는 대상 앱과 같은 권한(일반 권한)으로 실행(관리자면 COM 붙기 실패), 일반 권한 바인딩용 urlacl 1회 등록, COM은 에이전트 메인 스레드에서 실행, 보호된 보기는 UIA로 먼저 해제.
- 보류:
  - 대상을 직접 실행하는 수집(`cli-help`, `--allow-launch`로 자동 실행 후 UIA)은 부작용이 있어 따로 결정한다.
  - .NET 폼 글자 추정은 신뢰도가 낮다(IL 오프셋 부재). WPF(XAML/BAML)는 아직 해석하지 않는다.
  - 메뉴를 펼쳐야 보이는 하위 UIA 요소는 읽지 않는다.

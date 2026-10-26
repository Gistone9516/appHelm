# AppHelm

MCP를 지원하지 않는 Windows 프로그램을 AI가 조작할 수 있도록, 프로그램의 리소스와 Windows가 드러내는 창구를 읽어 **AI가 읽는 조작 문서**를 만드는 도구. 일반 실행 파일은 자체 분석만으로 문서를 만들고, .NET 폼·Electron fuse·Ghidra 추적에만 [REA](https://github.com/morluto/rea)(MIT)를 하위 엔진으로 불러 쓴다. 깊은 역공학은 하지 않는다.

## 설치

Windows와 Node.js 20 이상이 있으면 명령 한 줄로 설치한다. 저장소를 내려받거나 빌드할 필요가 없다.

```
npm install -g github:Gistone9516/appHelm
```

## 실행

```
apphelm map notepad
apphelm map "C:\Program Files\앱\app.exe" --out 결과폴더
apphelm map notepad --live
```

- Markdown 요약(4KB 이하)이 화면에 출력되고, `apphelm-out\<이름>.ops.md`와 전체 내용 `<이름>.ops.json`이 저장된다.
- `--live`를 붙이면 실행 중인 대상 창의 화면 요소(UI Automation)도 읽는다. 대상을 먼저 실행해 두어야 한다.
- 일반 실행 파일은 인터넷 없이 대상 하나에 5초 안팎이 걸린다. .NET·Electron 대상은 REA를 처음 내려받느라 첫 실행에 1분 정도 걸린다.
- 본인이 소유하거나 분석을 허가받은 프로그램에만 쓴다(저작권법 제101조의4).

조작(실행)과 원격:

```
# 실제 조작 (바로 실행됨)
apphelm invoke-com --progid Word.Application --attach --path "Selection.TypeText" --text "안녕"
apphelm invoke-window --target "C:\Windows\System32\notepad.exe" --wm 26
apphelm invoke-uia --target "C:\...\WINWORD.EXE" --name "편집 사용" --pattern Invoke
# 직접 그린 UI(자동화도 접근성 트리도 없는 앱): 창을 떠서 OCR로 좌표를 찾아 클릭
apphelm invoke-type --x 2155 --y 801 --text "안녕" --enter   # 입력칸 비우고 입력 후 전송(덧붙음 없음)
apphelm invoke-screenshot --target "수안"            # 창을 PNG로 (OCR·확인용)
apphelm invoke-click --x 2156 --y 802               # 화면 좌표 클릭

# 여러 단계를 한 번에: 단계 배열을 JSON 파일로 (경로 문법: Paragraphs(3).Range, $저장이름.멤버)
#   [{"path":"ActiveDocument.Paragraphs(1).Range","save":"p"},{"path":"$p.Style","setValue":-2},{"path":"ActiveDocument.Paragraphs","each":{"props":["Range.Text"]}}]
apphelm invoke-com --progid Word.Application --attach --steps steps.json

# COM 타입 라이브러리 전체(서명·기본값·상수)를 덤프하고 찾아보기
apphelm typelib "C:\경로\MSWORD.OLB"
apphelm ref Word Document.SaveAs2

# Office 계열 앱의 명령 목록 (리본 idMso + 예전 메뉴 컨트롤, 실행 중인 앱이 확인한 것만)
apphelm commands build --progid Word.Application --host book --scan WWLIB.DLL
apphelm commands find Word.Application 목차

# 원격: 대상 PC에서 에이전트를 띄우고(아래), 조작하는 쪽에서 --host 로 지정
#  - 대상이 Node가 있으면:   apphelm serve
#  - 대상이 무설치면:         powershell -ExecutionPolicy Bypass -File agent\apphelm-agent.ps1 -Token <토큰>
$env:APPHELM_TOKEN="<토큰>"
apphelm map 대상.exe --host book
apphelm ls --host book --path "C:\Program Files\Microsoft Office"     # 프로그램 폴더만, 읽기 전용
apphelm pull --host book --path "C:\...\WINWORD.EXE" --out 받은폴더     # 크기·SHA-256 확인
apphelm invoke-com --progid Word.Application --attach --path "Selection.TypeText" --text "안녕" --host 100.67.200.125
```

MCP 서버 (Claude Code에서 직접 호출):

```
# Claude Code에 등록 (한 번). 설치한 명령을 쓰므로 경로가 필요 없다
claude mcp add apphelm -- cmd /c apphelm-mcp
# 원격 조작을 쓰면 에이전트 토큰을 환경변수로 (-e는 이름 뒤, -- 앞에)
#   claude mcp add apphelm -e APPHELM_TOKEN=<토큰> -- cmd /c apphelm-mcp
```

등록 후 Claude Code에서 `map_program`, `get_operation_doc`, `invoke_operation`(단계 묶음), `com_reference`(COM 서명·상수 찾기), `app_commands`(Office 명령을 한국어로 찾기), `invoke_operation`에 click·screenshot 추가, `list_hosts`를 쓸 수 있다. stdout은 JSON-RPC 전용이라 로그는 전부 stderr로 나간다.

네이티브 동작 추적 (5차, Ghidra 필요):

```
# Ghidra 12.1.4 + JDK 21 설치 후 (환경변수 GHIDRA_INSTALL_DIR·JAVA_HOME 또는 C:\tools 기본 경로)
apphelm trace "C:\경로\app.exe" --query 함수이름
```

느리다(콜드 스타트 수백 초). 네이티브 PE(x86/x64)만, .NET 등 관리 코드는 지원 안 한다. Windows Ghidra는 실험적·읽기 전용이다.

개발할 때는 저장소를 받아 `npm install` 후 `node bin/apphelm.mjs ...`로 실행한다. 검증 명령:

```
npm run typecheck
npm run check:boundaries
npm test
npm run e2e
```

## AI 조작 지침

AI가 이 도구로 프로그램을 조작하는 방법은 **[docs/AI-GUIDE.md](docs/AI-GUIDE.md)** 에 있다(AI가 읽는 프롬프트라 영어). 요지:

1. **먼저 지도를 만든다.** `map_program` → `get_operation_doc`로 확인하고, 없는 명령은 추측하지 않는다.
2. **인식은 구조적인 것부터, 픽셀은 마지막** (IF-33). 글자 입력·표준 컨트롤은 UIA로. 스크린샷은 OCR·확인용 이미지일 뿐이다.
3. **조작 후 반드시 되읽어 확인한다.** COM은 속성 읽기, GUI는 스크린샷.
4. **앱 유형별 길**: ① COM 있는 앱(Office)은 `com_reference`·`app_commands`로 서명·명령을 찾아 `invoke_operation` com 단계 실행 → ② UIA만 있는 앱은 `uia` 조작 → ③ 자동화도 없는 직접 그린 앱(카카오톡)은 `screenshot`+OCR로 좌표를 찾아 `click`, 입력은 `type`(비우기 기본, `enter`로 전송).
5. **안전**: 메신저는 본인/테스트 대상에만 전송, 비가역·외부 동작은 확인, 앱 자체 암호 역공학·코드 주입 금지.

실증: Word에 서식 보고서를 단계 묶음으로 작성(F-26), 카카오톡 '나와의 채팅'에 한국어 입력·전송(F-28).

UI 툴킷 계열(Win32·COM·.NET·Delphi·웹기술·Qt/Java·게임·보호 앱 등 25개)마다 어떤 창구를 먼저 쓰고 무엇으로 폴백하는지, 그리고 어디서 멈추고 사람에게 넘기는지는 **[docs/STRATEGY.md](docs/STRATEGY.md)** 에 정리했다. 묶음별 조사 원본과 출처는 `docs/research/`에 있다. 사용자 조작을 실시간으로 지켜보다 조언할 때를 고르는 감시 모델 Laya의 정체와 역할은 **[docs/LAYA.md](docs/LAYA.md)** 에 있다.

## 구조

```
_인터페이스계약.md     공유 계약 (규칙 IF-1~IF-36, 실측 사실 F-1~F-33). 코드와 충돌하면 이 문서가 이긴다
bin/apphelm.mjs    실행 진입점 (tsx로 소스를 바로 실행)
agent/apphelm-agent.ps1    무설치 원격 에이전트 (Windows 기본 PowerShell/.NET만, 대상 PC에서 직접 실행)
src/invoke/            실행 계층: com·window·uia(화면 요소 클릭/토글/값)·http·shell
src/server/            에이전트 HTTP 핸들러 (map·invoke)
src/transport/         Tailscale 노드 이름/IP 해석
src/cli/               map·invoke-*·serve 명령과 원격 클라이언트
src/core/              공유 타입, 부작용 허용 판정(IF-2), 파이프라인 (수집원 동시 실행), UI 툴킷 표 (IF-35)
src/pe/                PE 헤더·import 표·리소스 디렉터리 읽기, MUI 파일 탐색
src/decoders/          리소스 바이트 해석: 메뉴·단축키·문자열·버전·대화상자, Delphi DFM, Electron asar, Qt 리소스(rcc)와 QML
src/rea-bridge/        REA CLI 실행(버전 6.7.0 고정, .NET·Electron·추적에만)
src/ps/                PowerShell 5.1 스크립트 실행기와 스크립트(scripts/*.ps1, ASCII 전용). com-core.ps1은 COM 실행 로직 원본
src/typelib/           타입 라이브러리 전체 덤프와 찾아보기 (서명·기본값·열거형 상수)
src/catalog/           Office 계열 명령 목록 (리본 idMso는 GetLabelMso로 확인한 것만)
scripts/build-ps.ts    com-core.ps1을 에이전트와 invoke-com.ps1에 넣는다 (npm run build:ps)
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
  qt-resources/          Qt 앱 exe 안의 QML에서 단축키와 라벨 (심볼 없이 rcc 표를 찾음)
  electron-js/           Electron 앱 package.json과 fuse (asar에서 직접)
  uia-snapshot/          실행 중인 창의 UI Automation 요소 (--live)
src/probe/             대상 판별 (경로나 이름 → 실행 파일, 종류, MUI, Electron 위치, UI 툴킷)
src/merge/             수집 결과 → 조작 문서 (같은 명령 합치기, 이름 결정, 자동화 창구 정리)
src/render/            Markdown 요약
src/cli/               apphelm map 명령
scripts/check-boundaries.ts   폴더 간 import 규칙 검사 (IF-3)
test/unit/, test/e2e/         단위 테스트, 실제 Windows 앱 테스트
```

## 설계 핵심

- **PE 리소스는 직접 읽는다 (IF-6).** 처음에는 REA가 리소스 위치를 찾게 했지만, 그러면 첫 실행에 내려받기(75초)와 인터넷이 필요해 다른 PC에서 바로 쓸 수 없었다. 리소스 디렉터리를 직접 읽게 바꾸고, 8개 파일에서 REA와 목록이 항목·순서까지 같은지 확인한 뒤 REA 경로를 지웠다(F-24).
- **MUI 파일을 따라간다 (IF-7).** Windows 기본 앱의 메뉴는 `ko-KR\notepad.exe.mui` 같은 별도 파일에 있다. 이걸 안 보면 메뉴가 통째로 빠진다.
- **같은 명령은 하나의 작업으로 합친다 (IF-10, IF-15).** 메뉴 항목과 단축키를 명령 ID로 묶는다. 단축키 표끼리 같은 키를 다른 명령에 연결하면, 소수 쪽 표를 특정 모드용으로 분류해 기본 단축키에서 뺀다. 메모장의 SLIPUPACC 표가 Ctrl+C를 "끝내기"에 연결하고 있어서 생긴 규칙이다.
- **COM은 서버의 기본 인터페이스를 앞세운다 (IF-17).** 서버 CLSID와 같은 coclass의 기본 인터페이스에서 예시 멤버를 뽑는다. 숨김 형식도 coclass가 가리키면 남긴다. IE의 IWebBrowser2가 `hidden`이라 일괄 제외하면 핵심 인터페이스가 빠졌다(F-12).
- **런타임마다 UI 정의가 있는 곳이 다르다 (IF-22~IF-24).** .NET은 `InitializeComponent`의 호출·필드 순서로 폼을 추정하고(REA가 IL 오프셋을 안 줘서 추정이므로 신뢰도 0.5, F-13), Delphi는 RCDATA의 이진 폼(TPF0)을 직접 해석하며, Qt Quick은 exe 안의 Qt 리소스 표를 찾아 QML 원문에서 단축키와 라벨을 읽고(IF-36), Electron은 asar에서 package.json과 fuse만 읽는다. 전체 JS 분석은 느리고 출력이 커서(F-15) 하지 않는다.
- **화면 수집은 사용자 세션에서 한다 (IF-14, IF-20).** 서비스 세션(Session 0)에서는 창이 보이지 않는다(F-7). 그래서 1회용 예약 작업으로 사용자 세션에서 스크립트를 돌리고, 끝나면 작업을 지운다.
- **PowerShell과는 파일로 주고받는다 (IF-21).** 스크립트는 ASCII만 쓰고, 입출력은 UTF-8 JSON 파일이다. PowerShell 5.1이 원소 1개 배열을 값으로 풀어 버리므로(F-11), 배열은 TypeScript 경계에서 `asArray()`로 맞춘다.
- **인식·조작은 구조적인 것부터, 픽셀은 마지막 (IF-33).** Win32 창·표준 컨트롤 → UIA/MSAA 접근성 트리 → OCR(윈도우 내장) → 비전 순서. 글자 입력은 UIA로 하고, 스크린샷은 OCR·확인용 이미지일 뿐 기본 조작 수단이 아니다. 자동화도 접근성 트리도 없는 직접 그린 항목만 `screenshot`+좌표 `click`으로 조작한다 (IF-34). 카카오톡 '나와의 채팅'에 글자를 넣고 전송하는 것을 실증했다(F-28).
- **COM 실행 로직은 한 벌이다 (IF-29).** 원격 에이전트는 파일 하나로 배포해야 해서 공용 파일을 불러올 수 없다. 그래서 `src/ps/com-core.ps1`을 원본으로 두고 빌드 스크립트가 에이전트와 로컬 스크립트에 그대로 넣는다. 예전에는 같은 로직이 세 벌이라 한쪽만 고쳐질 수 있었다. 테스트가 세 곳이 같은지 확인한다.
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
- Word 검증(2026-10-25, 노트북 Word 16): 자동화 정의 12,162개와 Office 공용 7,161개를 덤프하고, 리본 명령 299개와 예전 컨트롤 1,247개를 실제 Word에서 한국어 이름과 함께 확인했다. 원격 문서에 제목·소제목·굵게·글머리 목록·스타일 입힌 표·기울임꼴을 단계 묶음 3번으로 쓰고 문단별 스타일을 되읽어 확인했다. 리본 정의(XML)는 Word 바이너리에 없어서, 리본 이름은 후보를 앱에 물어 확인하는 방식이다(F-26, F-27).
- 화면 조작 계층(2026-10-25): `invoke-click`(좌표 클릭), `invoke-screenshot`(창/영역 PNG) 추가. 에이전트 v7(`2026-10-25.7-screen`)도 지원. MCP는 스크린샷을 파일로 저장하고 경로만 돌려준다(컨텍스트 보호). 카카오톡 자체 UI로 실제 입력·전송 검증(F-28). 다음: Win32 창구조 수집기, OCR 연동, 목록 네비게이션 자동화.
- 설치 간소화(2026-10-25): 일반 실행 파일 분석에서 REA 의존을 없애고 `npm install -g`로 설치되게 정리. 패키지 66KB, 설치 4초, 설치본으로 지도 생성과 MCP 응답을 확인했다.
- 보류:
  - 대상을 직접 실행하는 수집(`cli-help`, `--allow-launch`로 자동 실행 후 UIA)은 부작용이 있어 따로 결정한다.
  - .NET 폼 글자 추정은 신뢰도가 낮다(IL 오프셋 부재). WPF(XAML/BAML)는 아직 해석하지 않는다.
  - 메뉴를 펼쳐야 보이는 하위 UIA 요소는 읽지 않는다.

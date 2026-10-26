# 툴킷별 조작 전략

`docs/STRATEGY-RESEARCH.md` 규격에 따라 9개 묶음을 조사한 결과를 합친 문서다. 묶음별 원본(출처 링크 포함)은 `docs/research/01~09-*.md`에 있다. 조사일 2026-10-26.

## 1. 전체에서 보인 세 가지 흐름

### 1-1. 기존 도구는 "실행 중에 읽기"이거나 "개발자가 자기 앱에 심기"다

- 실행 중에 읽는 쪽은 UIA 트리나 CDP를 매번 훑는다. Windows-MCP, pywinauto, FlaUI, Playwright MCP, UFO가 여기 속한다.
- 개발자가 심는 쪽은 앱 소스나 빌드가 있어야 한다. AltTester, GameDriver, Dear ImGui Test Engine, Avalonia.Headless, Flutter integration_test, Playwright `_electron`이 여기 속한다.
- Office, AutoCAD, Photoshop, 한글용 MCP 서버는 많지만 사람이 고른 도구 수십 개를 손으로 노출하는 방식이다. 타입 라이브러리 전체나 리본 명령 목록을 AI에게 넘기는 서버는 찾지 못했다.
- 비어 있는 자리는 **남이 만든 설치된 앱을, 실행 전에 배포 파일에서 구조를 뽑아 지침서로 만드는 일**이다. 9개 묶음 모두에서 같은 결론이 나왔다.

### 1-2. 창구가 있어도 "켜는 스위치"를 모르면 빈 트리가 나온다

여러 계열에서 공식 스위치를 켜야 조작 창구가 열린다. 기존 도구는 이걸 사용자가 알아서 켠다고 가정한다.

| 계열 | 스위치 | 비고 |
|---|---|---|
| Java (F2) | `jabswitch -enable` 후 앱 재시작 | 기본 꺼짐, 가장 흔한 실패 원인 |
| Qt (F1) | `QT_ACCESSIBILITY=1` | Qt5 구버전만, Qt6 Windows는 UIA 기본 |
| GTK (F3) | `GTK_A11Y=accesskit` | GTK 4.18 이상, 그리고 그 옵션으로 빌드된 배포본만 |
| Chromium 계열 접근성 (E1~E4) | `--force-renderer-accessibility` | 보조기술 감지 전에는 꺼져 있음 |
| Electron, CEF (E1, E2) | `--remote-debugging-port`, Steam은 `-cef-enable-debugging` | 퓨즈는 이 포트를 막지 않음, 앱 코드가 걸러낼 때만 막힘 |
| WebView2 (E3) | `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` | 앱을 우리가 그 환경변수로 띄워야 하므로 이미 실행 중인 앱엔 못 씀 |
| Qt WebEngine (E4) | `QTWEBENGINE_REMOTE_DEBUGGING` | 앱 소스 수정 없이 외부에서 설정 |
| SAP GUI (B3) | 서버 `sapgui/user_scripting=TRUE` + 클라이언트 옵션 | 관리자가 끄는 경우가 많음 |
| 한글 (G2) | `HKCU\SOFTWARE\HNC\HwpAutomation\Modules` 보안모듈 등록 후 `RegisterModule` | 한컴이 제공한 절차 |

AppHelm은 배포 파일에서 툴킷을 판별할 수 있으므로 **"이 앱은 이 스위치를 켜야 이 창구가 열린다"를 조작 전에 알려줄 수 있다.** 기존 도구에 없는 사전 진단이다.

### 1-3. 한계선은 OS 사양으로 그을 수 있다

- 상위 무결성 프로세스에는 SendInput이 들어가지 않는다(UIPI).
- 저수준 훅은 주입 입력을 `LLKHF_INJECTED`로 구분할 수 있다.
- `SetWindowDisplayAffinity`가 걸린 창은 캡처에서 검게 나오거나 빠진다. 외부에서 `GetWindowDisplayAffinity`로 읽을 수 있다.
- 키보드보안, 가상 키패드, 안티치트는 돌파 대상이 아니다. 미리 알아채고 그 단계만 사람에게 넘긴다(4장).

## 2. 계열별 전략표

"정적"은 실행 없이 배포 파일에서 얻는 것, "1순위"는 조작할 때 먼저 쓰는 창구다.

| 코드 | 계열 | 정적으로 얻을 것 | 1순위 창구 | 폴백 | AppHelm 상태 |
|---|---|---|---|---|---|
| A1 | Win32 고전 메뉴 | RT_MENU, RT_ACCELERATOR의 명령 ID와 단축키 | WM_COMMAND 직송 | UIA | 완료. 메모장 동작 38개 전부 ID 매핑 |
| A2 | MFC 공용 컨트롤 | A1과 같은 리소스, mfc DLL로 판별 | 메뉴는 WM_COMMAND, 목록은 UIA | 오너데이터 목록은 OCR | 리소스만 됨 |
| A3 | Windows 리본 | UIFILE의 Command ID와 문자열 일부 | UIA (탭 선택 후 다시 읽기) | 키팁(Alt) | 부분 |
| B1 | COM/Office | typelib 전체, idMso와 예전 컨트롤 목록 | COM 객체모델 | ExecuteMso, 대화상자는 UIA | 완료. 사용자 세션에서만 실행 |
| B2 | 비 Office COM | typelib (품질 편차) | COM | COM 없는 LT판 등은 WM_COMMAND와 좌표 | typelib 덤프는 됨 |
| B3 | SAP GUI | 없음 | SAP GUI Scripting | 서버가 끄면 UIA와 좌표 | 미착수 |
| C1 | WinForms | 폼 클래스, 컨트롤 필드, 이벤트 핸들러 | UIA, Win32 | 좌표 | 완료 |
| C2 | WPF | `.g.resources`의 BAML에서 x:Name, Command, 메뉴 | UIA (UIA3) | 좌표 | BAML 미구현 |
| C3 | WinUI3/UWP | AppxManifest, .pri 문자열 | UIA | 좌표 | 미착수 |
| C4 | Avalonia | `!AvaloniaResources`의 AXAML | UIA (AutomationPeer) | 좌표 | 미착수 |
| D1 | Delphi VCL | DFM의 클래스, Caption, 이벤트명 | 표준 컨트롤은 Win32와 UIA | 커스텀 그리드는 좌표 | 완료. 단 설치기류는 캡션이 `*`로 비어 UIA 보강 필요 |
| D2 | FireMonkey | .fmx 폼 리소스 (디코드 여부 미측정) | 앱이 접근성 패키지를 켰으면 MSAA | 좌표와 OCR | 미착수 |
| E1 | Electron | asar, 퓨즈 상태, 진입점 | CDP (사용자가 포트 열고 실행) | Chromium 접근성 UIA, 좌표 | asar와 퓨즈만 |
| E2 | CEF | libcef.dll 판별 | CDP | UIA, 좌표 | 판별만 |
| E3 | WebView2 | 런타임과 UserData 폴더 | Edge WebDriver, CDP | 네이티브 셸은 UIA | 미착수 |
| E4 | Qt WebEngine | QtWebEngine DLL 판별 | CDP (환경변수) | UIA | 미착수 |
| F1 | Qt 위젯/QML | Qt 버전, .qml, .ui, qrc | UIA | 좌표 | 미착수 |
| F2 | Java | JAR 메타, resource bundle 문자열, 번들 JRE 위치 | Java Access Bridge | JavaFX는 UIA | 미착수 |
| F3 | GTK | libgtk 버전, .ui(Builder XML) | AccessKit 빌드면 접근성 | 좌표 | 미착수 |
| F4 | Flutter | flutter_assets의 문자열과 l10n | UIA (semantics 트리) | 좌표 | 미착수 |
| G1 | 메신저, 커스텀 업무앱 | 창 클래스 | 입력은 UIA Value 패턴 | 목록은 OCR와 좌표, 읽기는 앱 복사 기능 | 카카오톡 입력과 전송 완료 |
| G2 | 문서 스크립팅 앱 | typelib, 액션 ID | 앱 스크립팅 API (한글 HwpObject, Photoshop COM/UXP) | UIA | 이 PC에 한글 없음 |
| G3 | 게임 엔진 UI | `.locres`, `*.assets`의 UI 문자열 | 공식 모드와 콘솔이 있으면 그것 | OCR (문자열 사전으로 후보 제한) | 미착수 |
| G4 | 즉시모드 UI | 바이너리 평문 문자열, imgui.ini 배치 | 앱 단축키 | OCR와 고정 좌표 지도 | 미착수 |
| G5 | 보호, 반자동화 | 보호 모듈 서비스와 DLL | 공식 대안 API | 사람에게 인계 | 미착수 |

## 3. 계열별 우리 몫

- **Win32 (A).** 메뉴를 열지 않고 명령 ID를 바로 보낸다. 기존 도구는 메뉴를 펼쳐 가며 찾는다. 동적으로 만들어지는 메뉴 항목은 정적으로 못 얻는다.
- **COM (B).** 고정된 도구 수십 개 대신 typelib와 명령 카탈로그 전체를 AI에게 준다. 새 ActiveX 서버도 같은 경로로 처리된다. Microsoft는 무인, 서버측 Office 자동화를 지원하지 않으므로 사용자 세션에서만 돌린다.
- **.NET (C).** BAML과 AXAML을 못 읽는 건 기술적 벽이 아니다. ILSpy가 이미 BAML 변환과 Avalonia 리소스 읽기를 한다. 그 라이브러리를 재사용할지가 결정할 일이다. Avalonia는 커스텀 컨트롤의 피어가 없으면 UIA가 비는데, 그때도 AXAML에서 화면 구조를 복원할 수 있다.
- **Delphi (D).** 상용 도구(TestComplete, Ranorex)는 라이선스와 디버그 정보와 Delphi 버전에 묶인다. AppHelm은 exe 하나로 폼 구조를 문서화한다. 다만 캡션을 실행 중에 채우는 앱은 정적 문서만으로는 이름이 비므로, 실행 중 UIA 이름을 같은 컨트롤에 합쳐야 쓸 만하다.
- **웹기술 내장 (E).** 기존 도구는 모두 자기 앱을 테스트하는 개발자를 전제로 한다. 설치된 남의 앱에 대해 퓨즈와 asar와 런타임을 읽어 CDP, UIA, 좌표 중 어느 길로 갈지 미리 고르는 것이 우리 몫이다. 웹 창구와 네이티브 셸(UIA)을 한 지도에 합치는 것도 기존에 없다.
- **접근성 브리지 (F).** 툴킷 DLL로 계열을 판별해 어떤 스위치를 켜야 하는지 알려준다(1-2). 번들된 .ui, .qml, JAR 문자열을 읽어 이름 없는 노드에 라벨 후보를 붙인다. GTK는 접근성이 가장 약해서 정적 읽기의 가치가 가장 크다.
- **커스텀 업무, 문서 (G1, G2).** 카카오톡은 기존 MCP가 클립보드와 창 전면화에 기대는데, AppHelm은 UIA Value 패턴으로 클립보드를 건드리지 않고 입력한다. 문서 앱은 사람이 쓴 쿡북 대신 설치본에서 지침서를 뽑는다.
- **게임, 즉시모드 (G3, G4).** 배포본을 밖에서 다루는 도구는 비전뿐이다. 출하 문자열로 OCR 후보를 좁히고 고정 배치 지도를 저장하면, 매번 화면 전체를 해석하는 비전 에이전트보다 싸고 정확하다.
- **보호 (G5).** 시도하기 전에 읽기 전용 신호로 판정하고, 그 단계만 사람에게 넘긴 뒤 이어받는다(4장).

## 4. 한계선 처리 (G5)

조작 전에 아래 신호를 읽는다. 하나라도 걸리면 해당 단계는 조작하지 않는다.

| 신호 | 읽는 방법 | 판정 |
|---|---|---|
| 창의 display affinity가 0이 아님 | `GetWindowDisplayAffinity` | 캡처 불가 |
| 대상 프로세스 무결성 수준이 AppHelm보다 높음 | 토큰 무결성 조회 | 입력 차단 예상 |
| 안티치트 서비스와 드라이버 (vgk, vgc, EasyAntiCheat, BEService, npggNT 등) | 서비스, 드라이버 목록 | 게임 조작 대상 제외 |
| 키보드보안 모듈 (TouchEn nxKey, AhnLab Safe Transaction, nProtect, Veraport 등) | 설치 목록, 대상 exe가 불러오는 DLL | 해당 입력 단계는 사람 |
| 입력 후 무반응, 캡처 전체가 검정 | 사후 확인 | 런타임 판정 |

- 이 PC에서 읽어 보니 Vanguard 드라이버 `vgk`가 실행 중이었고 키보드보안 서비스는 없었다. 키보드보안은 웹에서 불러오는 방식이 있어 서비스 조회만으로는 놓칠 수 있다.
- 인계 방식은 "이 단계는 보안 프로그램이나 인증정보 입력이 필요해 직접 해야 합니다"라고 알리고, 그 단계만 넘긴 뒤 이어받는다. 실패해도 재시도하지 않는다(안티치트 계정 제재 위험).
- 공식 대안을 함께 안내한다. 증권은 KIS Developers와 키움 OpenAPI+, 은행은 오픈뱅킹과 은행의 내보내기 기능이다.
- 인증정보를 AI에게 맡기는 것이 전자금융거래법 제6조 제3항의 접근매체 대여에 해당하는지는 법률 검토가 필요하다. 그 전까지 금융 인증 단계는 항상 사람이 한다.

## 5. 실시간 조언 모드에 주는 시사점

제품 방향은 "AI 직접 조작"과 "실시간 조언"을 모두 얹을 수 있는 기반이다. 조언 모드에서는 Laya가 변화 피드를 감시하다가 조언 신호를 내면 LLM이 받아 행동한다(`docs/LAYA.md`). 그래서 계열마다 변화 알림이 있는지가 갈린다.

| 계열 | 변화를 아는 방법 |
|---|---|
| UIA를 노출하는 계열 (A, C, F 대부분) | UIA 이벤트 구독 |
| Office (B1) | COM 이벤트 (이번 조사 범위 밖, 따로 확인) |
| Photoshop (G2) | UXP `addNotificationListener` (공식 플러그인 경로) |
| 한글 (G2) | 공식 변경 이벤트를 찾지 못함, 주기적으로 본문을 읽어 비교 |
| 카카오톡 (G1) | 이벤트 없음, 입력창 Value나 스크린샷 OCR을 주기적으로 확인 |
| 웹기술 내장 (E) | CDP의 DOM 이벤트 |

## 6. 기반 다지기 후보

조사에서 나온 것 중 지금 방침(새 기획 없이 기반 다지기)에 맞는 순서다.

1. **툴킷 판별기 정리.** PE 임포트와 동봉 파일로 계열 코드(A1~G5)를 붙이고, 1-2의 스위치 안내와 2장의 1순위, 폴백 창구를 지도에 함께 적는다. 모든 계열에 공통으로 쓰이고 이미 있는 probe 위에 얹을 수 있다. 실측(7장)에서 Qt6, Flutter, CEF 앱이 모두 `native`로 판별됐다. exe 옆의 `Qt6Core.dll`, `flutter_windows.dll`, `libcef.dll`을 보지 않기 때문이다. CEF 앱은 창을 helper 프로세스(`steamwebhelper.exe`)가 갖고 있어서, 실행 중 화면을 읽을 때도 대상 exe 하나가 아니라 자식 프로세스까지 봐야 한다.
2. **G5 사전 판정.** 4장의 신호 중 정적으로 읽히는 것(display affinity, 무결성 수준, 서비스와 DLL)을 지도에 넣는다.
3. **정적 결과와 UIA 이름 합치기.** Delphi 설치기처럼 캡션이 비는 경우를 실행 중 UIA 이름으로## 7. 이 PC 실측 (2026-10-26)

이 PC에서 툴킷 표시 파일로 설치 앱을 훑었다. Java, GTK, Unity, FireMonkey 앱은 없었다. 찾은 앱의 창을 띄운 상태에서 `apphelm map --live`로 읽었다. 스크린리더는 켜지 않았다.

| 앱 | 계열 | AppHelm 판별 | 화면 요소 | 읽은 내용 |
|---|---|---|---|---|
| Free Download Manager | F1 Qt6 | `native` (오판) | 8개 | Text, TabItem, ToolBar, CheckBox, Edit 같은 종류는 나오지만 이름은 1개만 있음 |
| RustDesk | F4 Flutter | `native` (오판) | 1개 | `FLUTTERVIEW` 판 하나뿐, 안쪽 위젯은 안 보임 |
| Discord | E1 Electron | `electron` | 7개 | 전부 Pane, 이름은 창 제목뿐 |
| Steam | E2 CEF | `native` (오판) | `steam.exe` 0개, `steamwebhelper.exe` 16개 | 전부 Pane, 이름은 `Chrome Legacy Window`뿐 |

- **Qt6는 스위치 없이도 UIA가 켜져 있다.** 다만 컨트롤 종류만 나오고 이름이 비어 있어서, 정적 리소스로 라벨을 채우는 일이 필요하다.
- **Flutter는 스크린리더가 없으면 semantics 트리를 내보내지 않았다.** 조사 때 확인하지 못한 항목이 측정으로 확인됐다.
- **Chromium 계열(Electron, CEF)도 보조기술이 없으면 접근성이 꺼져 있었다.** 조사 내용과 같다. `--force-renderer-accessibility`로 다시 띄우면 달라지는지는 사용자의 Discord와 Steam을 재시작해야 해서 재지 않았다.

## 8. 남은 실측 후보

- Flutter와 Chromium 계열에서 접근성을 켜는 공식 방법(Chromium은 `--force-renderer-accessibility`, Flutter는 보조기술 감지 조건)으로 다시 띄웠을 때 요소가 얼마나 늘어나는지.
- Unity Accessibility 모듈을 켠 게임이 UIA에 노드로 보이는지 (이 PC에 Unity 앱 없음).
- AppHelm이 FireMonkey의 .fmx 폼을 디코드하는지 (이 PC에 FMX 앱 없음).
- Java와 GTK 앱의 접근성 트리 (이 PC에 없음).

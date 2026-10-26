# 03. .NET 계열 (C1 WinForms / C2 WPF / C3 WinUI3·UWP / C4 Avalonia) 자동화 현황

조사일 2026-10-26. 태그: [fact-cited]=URL 근거, [inference]=추론, [미확인]=1차 출처 못 엶. 로컬 `map` 측정은 안 함(정적 측정 생략).
주의: GitHub 페이지 fetch 결과에 최종 커밋일이 안 나옴 -> 유지보수 "최근성"은 대부분 [미확인].

## 공통 도구 (4계열 공유)
- FlaUI: .NET UIA 래퍼(UIA2/UIA3), 3.2k stars, open issues 243. Win32/WinForms/WPF/Store 대상. UIA2는 WPF·Store에서 약하고, UIA3는 WinForms에서 버그 있음(FAQ 위키) [fact-cited][1]
- WinAppDriver: 4.1k stars, open issues 1.1k. UWP/WinForms/WPF/Win32. Win10 + 개발자 모드 필요 [fact-cited][2]. Appium 드라이버 README가 "WinAppDriver는 MS가 더 이상 유지 안 함, 닫힌 소스 서버의 thin wrapper, Appium 4 비호환, 대안은 WinCore/NovaWindows 드라이버"라고 명시 [fact-cited][3]. 커뮤니티 스레드도 사실상 방치로 봄(2020~21 마지막 릴리스) [fact-cited][10]
- pywinauto: 6.2k stars, open issues 498. backend win32/uia. 관리자 권한 필요할 수 있음 [fact-cited][4]
- MCP/에이전트 계열: Windows-MCP(CursorTouch) 10.3k stars, 21개 도구, UIA 접근성 트리 Snapshot + 선택적 비전. 문단 내 텍스트 선택은 한계 [fact-cited][9]. uiautomation-mcp, WpfVisualTreeMcp(WPF 프로세스에 주입해 비주얼 트리 읽음 = 우리 범위 밖) 존재 [미확인: 검색 스니펫만][11][12]
- 정적 리더: ILSpy 26.8k stars, BAML->XAML 디컴파일 + !AvaloniaResources 지원 [fact-cited][7]. dnSpy 11.3k stars, BAML 디컴파일러 포함 [fact-cited][8]. 둘 다 사람이 쓰는 GUI 도구이고 "조작 문서 생성" 용도는 아님 [inference]

## C1 .NET WinForms
1. 현황: FlaUI/pywinauto(uia·win32)/WinAppDriver가 주력. WinForms는 Win32 HWND 기반이라 pywinauto win32 backend가 자연스러움 [inference]. Windows-MCP도 UIA 경유 [9].
2. 없다면 왜: 해당 없음(수요 큼, 도구 많음). 빈 곳은 "실행 전 구조 문서화".
3. 한계와 돌파: FlaUI UIA3 WinForms 버그 [1]. 컨트롤 Name이 디자이너 필드명이라 AutomationId로 노출되는 건 앱 구현에 달림 [inference]. 돌파 = 배포된 어셈블리의 managed 메타데이터(폼 클래스, 컨트롤 필드, 이벤트 핸들러)를 정적으로 읽어 UIA 런타임 이름과 매핑 (AppHelm 검증 완료).
4. 우리 가치: 실행 없이 폼/컨트롤/핸들러 목록 + 메뉴 WM_COMMAND ID를 문서화. 기존 도구는 전부 "실행 중 트리 덤프" 방식 [inference].

## C2 .NET WPF (Visual Studio 등)
1. 현황: UIA 자동화 피어 기반. FlaUI·WinAppDriver·pywinauto-uia·Windows-MCP가 UIA로 접근. UIA2는 WPF에 약해 UIA3 권장 [1]. 프로세스 주입형(WpfVisualTreeMcp)은 있으나 범위 밖 [12].
2. 없다면 왜: 정적 BAML->조작문서 도구가 없는 이유 = 수요가 "테스트 작성자 본인 앱"에 몰려 소스가 있음 [inference]. 기술 장벽은 낮음(ILSpy가 이미 BAML 변환) [7].
3. 한계와 돌파: 커스텀 컨트롤은 피어가 없거나 빈약해 트리에서 누락·무명 [inference]. 가상화 목록은 화면 밖 항목이 트리에 없음 [inference]. 돌파 = 어셈블리 내 `.g.resources`의 BAML을 ICSharpCode.BamlDecompiler 계열로 정적 변환해 x:Name, Command, 메뉴 계층, 바인딩 이름을 추출 -> UIA 런타임 트리와 대조. 대형 앱(VS)은 MEF/동적 메뉴라 정적만으로는 부분 커버 [inference].
4. 우리 가치: 같은 문서 형식으로 BAML 정적 추출 + UIA 라이브 트리를 결합. 단, BAML 추출은 현재 AppHelm 미구현(갭)이므로 라이브러리 재사용 여부 검토 필요 [inference].

## C3 WinUI3 / UWP (Photos, Settings)
1. 현황: UIA가 사실상 유일한 공식 표면. WinAppDriver는 UWP를 공식 지원(앱 ID로 실행) [2][3]. FlaUI는 Store 앱 지원 명시(UIA3) [1]. MS Q&A 답변이 Appium+WinAppDriver 우선, FlaUI(UIA3)를 대안으로 안내 [13: 검색 스니펫, 미확인].
2. 없다면 왜: 공식 대안이 방치 상태라 "있으나 죽어가는" 상태. 새 도구(NovaWindows 등)로 이동 중 [3].
3. 한계와 돌파: 패키지(AppX) 앱은 AUMID 필요, 설치 경로가 WindowsApps라 파일 접근이 제한됨 [inference]. XAML이 컴파일된 .xbf라 정적 읽기가 어려움 [inference, 미확인]. 돌파 = 매니페스트(AppxManifest.xml), 리소스 .pri 문자열, 공개 UIA 트리를 읽음(모두 출하 데이터/공식 표면).
4. 우리 가치: .pri/매니페스트 기반 문자열·진입점 정리는 기존 도구에 없음 [inference, 미확인]. UIA 조작은 차별점 아님.

## C4 Avalonia
1. 현황: 자체 렌더링이지만 컨트롤별 AutomationPeer를 플랫폼 접근성 API에 매핑: Windows UIA / macOS NSAccessibility / Linux AT-SPI2 모두 "Full support", WASM만 부분 [fact-cited][6]. AutomationId는 UIA AutomationId / macOS accessibilityIdentifier로 매핑, 테스트용 안정 ID로 권장 [6]. 공식 헤드리스 테스트(Avalonia.Headless): 키보드·마우스 시뮬레이션, 프레임 캡처. 단 앱 내부(in-proc) 테스트용이며 외부 앱 조작은 아님 [fact-cited][5]. 외부 도구는 FlaUI 등 UIA 클라이언트를 쓸 수 있다고 [inference] (Avalonia 전용 FlaUI 이슈는 검색에서 못 찾음).
2. 없다면 왜: 전용 외부 자동화 도구는 없음. 공식 대안(헤드리스)이 "자기 앱 테스트"로 수요를 흡수.
3. 한계와 돌파: 커스텀 컨트롤은 OnCreateAutomationPeer를 구현해야 노출됨 [6] -> 미구현 앱은 UIA 트리가 비어 보임. Avalonia 앱은 HWND 하위 컨트롤이 없어 pywinauto win32 backend 무용 [inference]. 돌파 = 배포 DLL 내 `!AvaloniaResources`(AXAML)를 정적 추출해 컨트롤 이름·AutomationProperties를 확보 (ILSpy가 지원 [7]). UIA 부실하면 좌표 클릭 + 스크린샷 폴백.
4. 우리 가치: UIA가 비어도 AXAML에서 화면 구조를 복원하는 정적 경로. 기존 외부 도구는 UIA 트리에만 의존 [inference].

## 6축 표 (대표 앱, 대부분 [inference]; 실측 안 함)
| 앱 | 1 텍스트 | 2 합성입력 | 3 캡처 | 4 레이아웃 | 5 사이드채널 | 6 화면모드 |
|---|---|---|---|---|---|---|
| C1 사내 WinForms LOB | 앱 카피(메타데이터 + UIA) | SendInput ok | 정상 | 고정 | 로컬 DB 흔함 | 창 |
| C2 Visual Studio | 부분 접근성(커스텀/가상화 누락) | ok | 정상 | 스크롤 동적(도킹·가상화) | 스크립팅 API(DTE/확장) | 창 |
| C3 Photos/Settings | 부분 접근성(UIA) | ok | 정상(콘텐츠 보호 창 제외) | 스크롤 동적 | 없음(Settings는 URI 스킴 ms-settings: 있음 [미확인]) | 창 |
| C4 Avalonia 앱 | 부분(피어 구현에 의존) | ok(자체 렌더라 좌표 방식) | 정상 | 앱별 | 없음 | 창 |

## 출처
1. https://github.com/FlaUI/FlaUI (1차)
2. https://github.com/microsoft/WinAppDriver (1차)
3. https://github.com/appium/appium-windows-driver (1차)
4. https://github.com/pywinauto/pywinauto (1차)
5. https://docs.avaloniaui.net/docs/concepts/headless/ (1차)
6. https://docs.avaloniaui.net/docs/app-development/accessibility (1차)
7. https://github.com/icsharpcode/ILSpy (1차)
8. https://github.com/dnSpyEx/dnSpy (1차)
9. https://github.com/CursorTouch/Windows-MCP (1차)
10. https://learn.microsoft.com/en-us/answers/a/1592661 (커뮤니티 Q&A, 검색 스니펫)
11. https://github.com/locomorange/uiautomation-mcp (검색 결과만, 미열람)
12. https://www.nuget.org/packages/WpfVisualTreeMcp (검색 결과만, 미열람)
13. https://learn.microsoft.com/en-us/answers/a/1897799 (검색 스니펫)

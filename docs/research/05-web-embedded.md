# 조사 05 — 임베디드 웹 기술군 (Electron / CEF / WebView2 / Qt WebEngine)

조사일 2026-10-26. 태그: [fact-cited n] = 출처 번호 직접 열람, [inference] 추론, [미확인] 단일 요약/목록 의존.

## 공통 사실
- Chromium 계열은 `--remote-debugging-port`로 CDP를 연다. 퓨즈(fuse)는 이 플래그를 막지 않는다. 메인 프로세스 코드가 필터링할 때만 막힌다 [fact-cited 8: electron/fuses 이슈 메인테이너 발언, 검색 요약 경유 → 부분 미확인].
- `nodeCliInspect` 퓨즈는 `--inspect*`와 SIGUSR1 인스펙터만 통제한다 [fact-cited 1]. 그러나 Playwright `_electron.launch`는 이 퓨즈가 false이면 타임아웃 가능 [fact-cited 2].
- Chromium 접근성은 기본 꺼짐, 보조기술 감지 시 자동 켜짐. `--force-renderer-accessibility=[basic|form-controls|complete]`로 강제 [fact-cited 9]. Windows는 MSAA/IA2/UIA 노출 [fact-cited 9]. Electron은 보조기술 존재 시 자동 활성, `app.setAccessibilitySupportEnabled`로 수동 [fact-cited 10].
- 로컬 측정: VS Code 1.143.1 `Code.exe`를 `apphelm map`(정적)한 결과 RunAsNode=enabled, EnableNodeCliInspectArguments=enabled, EmbeddedAsarIntegrity=disabled, OnlyLoadAppFromAsar=disabled. 포트는 미확인(실행 안 함). 퓨즈 상태가 앱 코드의 포트 차단 여부를 증명하지 않음 [fact: 로컬 실측 Code.ops.json].

## E1 Electron
1. 현황
- Playwright `_electron` : 실험적, Electron v21+, `electron.launch()`로 메인/렌더러 JS 실행·스크린샷 [fact-cited 2]. Playwright MCP(38.6k★)는 접근성 스냅샷 기반, `--cdp-endpoint`로 기존 Chromium 연결. Electron 언급은 없음 [fact-cited 3].
- Chrome DevTools MCP(54.1k★): 공식 지원은 Chrome/Chrome for Testing뿐, 타 Chromium은 보장 안 함 [fact-cited 4].
- WebdriverIO: electron 서비스, v26+ chromedriver 자동. 구 community 저장소는 deprecated, 후속 `@wdio/electron-service` [fact-cited 5]. Spectron은 종료("RIP") [fact-cited 5]. Electron 공식 문서도 자체 테스트 도구 없음, WDIO/Playwright 안내 [fact-cited 6].
- Electron MCP 다수(halilural/electron-mcp-server 등): 앱을 `--remote-debugging-port=9222`로 띄워야 함 [미확인: 디렉터리 목록만 열람, 유지보수 상태 미검증 7].
2. 없다면 왜: 도구는 있으나 전부 "개발자가 자기 앱 소스/빌드를 가진 테스트" 전제. 남의 설치된 앱의 지침서화는 비어 있음 [inference].
3. 한계/돌파
- 한계: 패키지 앱 대상 launch는 `args`가 진입점이라 맞지 않음, `nodeCliInspect` false 시 Playwright 실패, 앱이 CLI 스위치를 무시/필터할 수 있음 [fact-cited 2][inference].
- 돌파(범위 내): 사용자가 출하된 스위치로 직접 실행(`--remote-debugging-port`)한 뒤 CDP attach(`connectOverCDP`/`--cdp-endpoint`). 막힌 앱은 `--force-renderer-accessibility`로 Chromium 접근성(UIA) 트리 읽기 + 좌표 입력으로 폴백 [inference].
4. 우리 가치: asar/퓨즈 정적 판독으로 "CDP 가능 여부·진입점·IPC 후보"를 실행 전에 문서화. 퓨즈 상태를 근거로 CDP/UIA/좌표 중 경로를 자동 선택. 기존 도구에 없는 사전 진단 [inference].

## E2 CEF
1. 현황: CEF는 `CefSettings.remote_debugging_port`(1024–65535) 또는 `remote-debugging-port` 스위치로 DevTools 활성 [fact-cited 11]. Steam은 `-cef-enable-debugging`으로 localhost:8080 [fact-cited 12: 검색 요약, Valve 위키 직접 열람은 403 → 미확인]. Steam Deck 커뮤니티(Decky, CSS Loader, Steam 테마 도구)가 이 포트로 UI를 조작·스타일링 [미확인 12]. Ranorex가 CEF 앱 테스트 지원을 문서화 [미확인 13].
2. 없다면 왜: 범용 MCP/RPA는 없음. 수요는 Steam 커스터마이징 커뮤니티에 한정 [inference].
3. 한계/돌파: 포트는 앱이 `CefSettings`에서 끄면 스위치가 무시될 수 있음 [inference]. 포트는 로컬 전체 노출이라 보안 주의 [fact-cited 12 일부]. 돌파: 허용되는 앱은 공식 스위치, 아니면 UIA/좌표. Steam은 `libcef.dll`을 이 PC에서 확인 [fact: 로컬 파일 존재].
4. 우리 가치: `libcef.dll` 탐지와 임베더가 정의한 스위치 단서 수집으로 "CDP 가능 여부"를 사전 분류. 문서화된 게임 클라이언트 UI 지침서 생성 [inference].

## E3 WebView2
1. 현황: Microsoft 공식 Edge WebDriver가 WebView2 자동화를 지원. launch(`UseWebView`+`BinaryLocation`)와 attach(`DebuggerAddress`) 방식 [fact-cited 14]. attach는 `--remote-debugging-port`를 WebView2 생성 시 추가 인자로 줘야 함. 네이티브 UI는 WinAppDriver/UIA로 별도 처리하라고 명시 [fact-cited 14]. 인자는 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 환경변수/레지스트리로 주입 가능 [fact-cited 14]. F12/Ctrl+Shift+I 및 `--auto-open-devtools-for-tabs` 공식 [fact-cited 15]. Playwright `connectOverCDP`도 가능 [inference].
2. 없다면 왜: 공식 대안(Edge WebDriver)이 존재. 단 "개발자가 자기 앱"을 전제로 한 문서 [fact-cited 14].
3. 한계/돌파: 드라이버와 런타임 버전 일치 필수 [fact-cited 14]. launch는 첫 WebView2 하나에만 붙음 [fact-cited 14]. 앱 코드가 이 환경변수를 덮어쓰면 실패 [inference]. 돌파: 환경변수를 지정해 앱을 우리가 직접 기동(출하된 공식 변수), 이후 attach. 네이티브 셸은 UIA로 [fact-cited 14].
4. 우리 가치: WebView2 호스트 탐지(런타임·UserData 폴더)와 네이티브 UIA를 한 문서에 합쳐 하이브리드 앱(네이티브 셸 + 웹) 전체 지도를 제공 [inference].

## E4 Qt WebEngine
1. 현황: `--webEngineArgs --remote-debugging-port=N` 또는 `QTWEBENGINE_REMOTE_DEBUGGING` 환경변수로 활성. WebSocket 오류 시 `--remote-allow-origins` [fact-cited 16]. 이 환경변수는 앱 소스 수정 없이 외부에서 설정 가능 [fact-cited 16]. Qt 전용 자동화 도구는 Squish(상용) 등 [미확인, 이번에 열람 안 함].
2. 없다면 왜: 사용 앱이 적고 Qt 쪽 자동화는 Squish 같은 상용 도구에 집중 [inference].
3. 한계/돌파: 포트 미지정 시 origin `*` 허용되어 보안상 주의 [fact-cited 16]. 앱이 인자를 파싱하지 않으면 무시됨. 돌파: 환경변수 경로가 가장 약한 결합 [inference].
4. 우리 가치: QtWebEngine DLL 탐지 시 환경변수 한 줄로 CDP 경로를 안내하고, Qt 네이티브 위젯은 UIA로 보완 [inference].

## 6축 표 (대표 앱)
| 앱 | 1 텍스트 | 2 입력 | 3 캡처 | 4 레이아웃 | 5 사이드채널 | 6 화면 |
|---|---|---|---|---|---|---|
| VS Code (E1) | 앱 카피(CDP DOM)·접근성 | SendInput 가능 | 일반 | 스크롤 동적 | 스크립팅 API(`code` CLI, URL 프로토콜), 로컬 DB(확장 저장소) | 창 |
| Slack/Discord (E1) | 부분 접근성(CDP는 빌드별 [미확인]) | 가능 [inference] | 일반 | 스크롤 동적 | 로컬 캐시, 공식 API는 별개 | 창 |
| Steam (E2) | CDP 가능 시 앱 카피, 아니면 부분 | 가능 [inference] | 일반 | 스크롤 동적 | 로컬 DB(라이브러리 파일), Steam URL | 창 (빅피처는 전체화면) |
| WebView2 앱 (E3) | 앱 카피(CDP/WebDriver)+UIA | 가능 | 일반 | 앱별 | 앱별 | 창 |
| Qt WebEngine 앱 (E4) | CDP 시 앱 카피 | 가능 [inference] | 일반 | 앱별 | 앱별 | 창 |
(2~6축은 실측 없이 일반 지식 위주 → 대부분 [inference])

## 출처
1. https://www.electronjs.org/docs/latest/tutorial/fuses (1차)
2. https://playwright.dev/docs/api/class-electron (1차)
3. https://github.com/microsoft/playwright-mcp (1차)
4. https://github.com/ChromeDevTools/chrome-devtools-mcp (1차)
5. https://github.com/webdriverio-community/wdio-electron-service (1차)
6. https://www.electronjs.org/docs/latest/tutorial/automated-testing (1차)
7. https://glama.ai/mcp/servers/@halilural/electron-mcp-server (디렉터리, 2차)
8. https://github-redirect.dependabot.com/electron/fuses/issues/6 (1차 이슈, 검색 요약 경유)
9. https://chromium.googlesource.com/chromium/src/+/main/docs/accessibility/overview.md (1차)
10. https://www.electronjs.org/docs/latest/tutorial/accessibility (1차)
11. https://chromiumembedded.github.io/cef/general_usage (1차)
12. https://developer.valvesoftware.com/wiki/Command_line_options_(Steam) (1차, 검색 요약만 확인) · https://docs.steambrew.app/developers/themes/getting-started (2차)
13. https://supportdesk.ranorex.com/hc/en-us/articles/22467515213853-Testing-of-CEF-applications (2차, 미열람)
14. https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver (1차)
15. https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-devtools (1차)
16. https://doc-snapshots.qt.io/qtwebengine/qtwebengine-debugging.html (1차)

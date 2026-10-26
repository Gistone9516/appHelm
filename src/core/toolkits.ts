// UI 툴킷 표 (IF-35). 판별 표지와 조작 안내를 한곳에 둔다. 코드는 docs/STRATEGY.md 계열 코드다.

export interface ToolkitSpec {
  id: string;
  code: string;
  name: string;
  /** exe가 import하거나 exe 폴더에 있으면 이 툴킷으로 본다 (소문자) */
  files: string[];
  /** true면 exe 폴더 아래 깊이 3까지도 찾는다 (CEF, 번들 JRE처럼 하위 폴더에 두는 경우) */
  deep?: boolean;
  /** 먼저 쓸 창구 */
  primary: string;
  /** 창구를 여는 공식 스위치. 없으면 생략 */
  enable?: string;
}

export const TOOLKITS: readonly ToolkitSpec[] = [
  {
    id: "qt6", code: "F1", name: "Qt6", files: ["qt6core.dll", "qt6gui.dll"],
    primary: "UIA (Qt6는 기본으로 켜져 있지만 이름이 비는 경우가 많음)",
  },
  {
    id: "qt5", code: "F1", name: "Qt5", files: ["qt5core.dll", "qt5gui.dll"],
    primary: "UIA",
    enable: "Qt 5.7~5.14는 환경변수 `QT_ACCESSIBILITY=1`로 실행",
  },
  {
    id: "qtwebengine", code: "E4", name: "Qt WebEngine", files: ["qt6webenginecore.dll", "qt5webenginecore.dll", "qtwebengineprocess.exe"],
    primary: "CDP",
    enable: "환경변수 `QTWEBENGINE_REMOTE_DEBUGGING=<포트>`로 실행",
  },
  {
    id: "flutter", code: "F4", name: "Flutter", files: ["flutter_windows.dll"],
    primary: "UIA (semantics 트리, 보조기술이 없으면 판 하나만 보임)",
  },
  {
    id: "cef", code: "E2", name: "CEF", files: ["libcef.dll"], deep: true,
    primary: "CDP, 화면 창은 자식 프로세스가 가짐",
    enable: "`--remote-debugging-port=<포트>` (Steam은 `-cef-enable-debugging`), 접근성은 `--force-renderer-accessibility`",
  },
  {
    id: "webview2", code: "E3", name: "WebView2", files: ["webview2loader.dll"],
    primary: "Edge WebDriver 또는 CDP, 바깥 창은 UIA",
    enable: "환경변수 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<포트>`로 앱을 새로 실행",
  },
  {
    id: "java", code: "F2", name: "Java", files: ["jvm.dll", "javaw.exe"], deep: true,
    primary: "Java Access Bridge",
    enable: "`jabswitch -enable` 후 앱 재시작",
  },
  {
    id: "gtk", code: "F3", name: "GTK", files: ["libgtk-3-0.dll", "libgtk-4-1.dll", "libgtk-win32-2.0-0.dll"],
    primary: "좌표와 OCR (Windows 접근성이 약함)",
    enable: "GTK 4.18 이상 AccessKit 빌드만 `GTK_A11Y=accesskit`",
  },
  {
    id: "unity", code: "G3", name: "Unity", files: ["unityplayer.dll"],
    primary: "OCR와 좌표 (위젯 트리 없음)",
  },
];

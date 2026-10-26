# 프레임워크 전략 조사 규격

AppHelm이 새 프로그램을 다룰 때, 대상의 **UI 툴킷**에 따라 전략이 자동으로 붙도록 하기 위한 조사의 규격이다. 이 문서는 조사 *방법*을 정하고, 실제 결과는 `docs/STRATEGY.md`(예정)에 쌓는다.

## 1. 전제

- 조작 전략을 가르는 것은 제조사가 아니라 **UI를 그리는 툴킷**이다. 같은 툴킷은 같은 창구를 같은 방식으로 연다.
- 기획 범위를 넘지 않는다: 앱이 배포한 데이터·공식 창구·사람과 같은 조작만. 앱 자체 암호 역공학, 코드 주입, 보호 우회는 하지 않는다([[core-intent]]).
- 새 대상은 **현황 조사부터**: 기존 도구를 먼저 찾고 그보다 나은 방식을 제시한다([[prior-art-first]]).

## 2. 조작 가능성을 가르는 6개 축

대상이 어느 계열이든, 아래 6축 위에 놓고 전략을 정한다.

1. **텍스트 추출**: 앱 복사기능 / 부분 접근성 / 없음(OCR·비전뿐)
2. **합성 입력 수용**: SendInput 받음 / 무시·차단
3. **화면 캡처**: 정상 / 검은 화면(DRM·디스플레이 보호)
4. **레이아웃 안정성**: 고정 / 스크롤·동적 / 무작위화
5. **측면 채널**: 로컬 DB / 스크립팅 API / 모드·콘솔 / 없음
6. **화면 모드**: 창 / 전체화면 전용

## 3. 계열 taxonomy

`✓` = AppHelm이 실제 검증한 계열.

| 코드 | 계열 | 대표 | 판별 신호 | 예상 창구(검증 대상) | 검증 |
|---|---|---|---|---|---|
| A1 | Win32 고전 메뉴 | 메모장, regedit | RT_MENU/RT_DIALOG | 명령ID·WM_COMMAND, 리소스 정적 | ✓ |
| A2 | MFC 공용 컨트롤 | 구형 유틸 | MFC DLL, SysListView | Win32 메시지(LVM_·TVM_) | — |
| A3 | Windows 리본 | 그림판, 탐색기 | UIFILE(NetUI) | 런타임 UIA, 정적 약함 | 부분 |
| B1 | COM/Office | Word·Excel·PPT | 등록 typelib + ExecuteMso | typelib + 명령 카탈로그 | ✓ |
| B2 | 비-Office COM | AutoCAD, ActiveX | 등록 COM 서버 | typelib(편차) | — |
| B3 | 전용 스크립팅 API | SAP GUI | 자체 스크립팅 IF | 공식 스크립팅 API | — |
| C1 | .NET WinForms | 사내 LOB | CLR + WinForms | 관리 메타데이터 + UIA | ✓ |
| C2 | .NET WPF | Visual Studio | CLR + PresentationCore | UIA(automation peer), BAML 정적 격차 | — |
| C3 | WinUI3/UWP | 사진, 설정 | AppX + WinUI | UIA | — |
| C4 | Avalonia | 크로스 .NET | Avalonia DLL | 자체 렌더, UIA 편차 | — |
| D1 | Delphi VCL | 설치제거기 | DVCLAL + TPF0 | DFM 정적 + UIA | ✓ |
| D2 | Delphi FireMonkey | 신형 Delphi | FMX 런타임 | 자체 렌더 | — |
| E1 | Electron | VS Code, Slack | app.asar | CDP(DOM·JS) + 접근성, asar 정적 | 부분 |
| E2 | CEF | Steam, Spotify구 | libcef.dll | CDP 가능성 | — |
| E3 | WebView2 | 신형 MS앱, Tauri | WebView2 런타임 | DevTools 프로토콜 | — |
| E4 | Qt WebEngine | 일부 크로스앱 | QtWebEngine DLL | CDP 유사 | — |
| F1 | Qt 위젯/QML | 금융 HTS, 디자인툴 | Qt5/6Core DLL | QAccessible→UIA 브리지(편차) | — |
| F2 | Java | 이클립스, 공공앱 | JRE, AWT | Java Access Bridge | — |
| F3 | GTK (Windows) | GIMP, Inkscape | libgtk | ATK(윈도우 제한) | — |
| F4 | Flutter desktop | 신형 크로스앱 | flutter_windows.dll | semantics 트리 | — |
| G1 | 메신저·커스텀 업무앱 | 카카오톡(EVA) | 자체 창클래스 | 복사기능, 로컬 DB | ✓ |
| G2 | 문서·캔버스(스크립팅 보유) | 한글, 포토샵, CAD | 캔버스 커스텀 + API | **문서 스크립팅 API**(사실상 B계열) | — |
| G3 | 게임엔진 UI | Unity, Unreal | 엔진 런타임 DLL | 비전·OCR, 엔진 콘솔·모드 | — |
| G4 | 즉시모드 툴 UI | Dear ImGui 툴 | — | 레이아웃 고정 → OCR→좌표 | — |
| G5 | 보호·반자동화 | 보안키보드, DRM, 안티치트 | — | 입력차단·캡처검정·무작위화 → **한계선** | — |

## 4. 계열마다 답할 4개 질문

1. **현황**: 누가·무엇으로·어디까지 하나 (도구명, 쓰는 창구, 가능한 동작, 유지보수 상태)
2. **없다면 왜**: 수요 부재 / 기술적 벽 / 공식 대안 존재 중 어느 것인가
3. **한계와 돌파**: 기존 도구가 공통으로 막히는 지점과, 기획 범위 안에서 넘는 방법
4. **우리 가치**: 이 계열에서 AppHelm만 할 수 있거나 더 싸게·정확하게 할 수 있는 것

## 5. 출처와 근거 등급

- 한국어·영어 모두. 범위는 MCP 서버, RPA, 테스트 자동화, 접근성 도구, 매크로, 공식 SDK 문서. (테스트·접근성 업계도 본다 — 같은 문제를 오래 풀었다.)
- 1차 출처(저장소 README·공식 문서)를 직접 확인. 블로그 요약만 있으면 "미확인" 표기.
- 유지보수 상태는 별 수·최근 커밋·이슈의 한계 기록으로 본다.
- 실측 가능한 신호(접근성 노출 정도 등)는 이 PC의 설치 앱으로 직접 잰다.

## 6. 조사 묶음 (9대)

돌파 전략이 비슷한 것끼리 묶는다.

1. Win32 (A1·A2·A3) 2. COM (B1·B2·B3) 3. .NET (C1~C4) 4. Delphi (D1·D2) 5. 웹기술 내장 (E1~E4) 6. 접근성 브리지형 (F1~F4) 7. 커스텀 업무·문서 (G1·G2) 8. 게임·즉시모드 (G3·G4) 9. 보호·반자동화 (G5)

각 묶음 1대가 4개 질문의 답 + 출처 링크를 파일로 남기고, opus가 합쳐 `docs/STRATEGY.md`로 만든다.

## 7. 에이전트 프롬프트 템플릿 (영어, 각 묶음에 전달)

> Survey existing automation for the `<family>` UI toolkit on Windows (and macOS where relevant). For each of the 4 questions (current state / why-absent / limits-and-breakthrough / our-value), give findings with source links, 1st-party sources preferred, mark unverified claims. Place each representative app on the 6 operability axes. Scope stays within: shipped data, official surfaces, human-equivalent operation — no decryption, injection, or protection bypass. Output a structured report under 500 words + a sources list.

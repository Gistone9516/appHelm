# G6. 접근성 브리지 계열 (Qt / Java / GTK / Flutter)

조사일 2026-10-26. 태그: [fact-cited n] = 출처 번호, [inference], [assumption], [미확인]. 로컬 실측 없음(대상 앱 미설치 확인 안 함, 정적 map 미실행).

## F1 Qt Widgets/QML

1. 현황
- Squish(Qt Group): Qt Widgets/QML/Quick/WebEngine + Java AWT/SWT/RCP/Swing/JavaFX 지원, 상용 구독. 접근성 대신 자체 훅(앱 내 주입형 추정) [fact-cited 15; 훅 방식은 inference].
- Qt 공식: QAccessible 추상화 -> 플랫폼 API로 노출. 커스텀 위젯은 QAccessibleInterface + QAccessiblePlugin 필요 [fact-cited 1, 2].
- Windows 백엔드: MSAA에서 UI Automation 구현으로 교체됨(qtbase `plugins/platforms/windows/uiautomation`, WM_GETOBJECT -> UiaReturnRawElementProvider) [fact-cited 3, 4].
- pywinauto: UIA 백엔드가 Qt5 지원 표기 [fact-cited 16]. 비공식 가이드: Qt 5.7~5.14는 `QT_ACCESSIBILITY=1` 필요, 6.x는 기본 활성 [미확인 17].
- 키움 HTS 화면 자동화 vs OpenAPI+ 직접 비교 자료는 못 찾음. OpenAPI+ 로그인에 pywinauto 쓰는 사례만 확인 [미확인 18].
2. 왜 없나: 기술 벽보다 "공식 대안(증권사 API)" 이 수요를 흡수. 화면 자동화는 로그인/버전처리 구간에 국한 [inference].
3. 한계/돌파
- 한계: 접근성 플러그인 누락, 커스텀 위젯(차트/호가창)이 이름 없는 Pane으로만 보임 [inference].
- 돌파(범위 내): Qt 4.x 문서상 Unix만 `QT_ACCESSIBILITY=1` 필요, Windows 기본 on [fact-cited 2; 구버전 문서]. 환경변수 `QT_ACCESSIBILITY=1`은 Qt5 구버전 대상 공식 스위치 [inference]. 그 외는 UIA 트리 확인 후 좌표+스크린샷으로 폴백.
4. 우리 가치: Qt DLL 버전(Qt5/6Core) 판별로 "접근성 기대 수준" 사전 예측, 동봉된 .qml/.ui/qrc 리소스의 정적 읽기로 objectName/메뉴/단축키 복원 [inference; qrc가 컴파일되어 바이너리 내장이면 추출 난이도 상승, 미확인].

## F2 Java (AWT/Swing/SWT)

1. 현황
- Java Access Bridge(JAB): Windows JDK의 `jabswitch -enable`이 `~/.accessibility.properties` 작성, 재시작 필요 [fact-cited 5]. 제어판 "접근성 센터"로도 켬 [fact-cited 6 (미러)].
- pyjab: Windows 전용, 52 stars, 430 commits. JavaFX 미지원(UIA 사용), Canvas 직접 그리기/브라우저 내 Java/비접근성 컴포넌트 불가, 테이블 화면밖 셀 불안정, `simulate=True`는 실제 커서 이동 [fact-cited 8]. 마지막 커밋일 [미확인].
- Hyland RPA 등 RPA 제품이 JAB 활성화를 설치 단계에 요구 [fact-cited 7].
- SWTBot(Eclipse): 4.1.0이 최신 릴리스(wiki 기준), Eclipse 자체 호스팅 [fact-cited 9]. SWT 위젯 트리 직접 접근(앱 내부 실행형).
- Access Bridge Explorer: 개발자용 트리 탐색기 [미확인, 미러만 확인].
2. 왜 없나: 있음. 다만 JAB 비활성이 기본이라 "빈 트리"로 실패 [fact-cited 5, 6].
3. 한계/돌파: JAB 미활성이 최다 원인. 돌파: `jabswitch -enable`(공식, 사용자 홈 파일만 수정) 후 앱 재시작. 앱 번들 JRE는 `jabswitch`가 없을 수 있음 [assumption]. JavaFX는 UIA로 별도 경로.
4. 우리 가치: JRE/JAR 존재 판별 후 JAB vs UIA 경로 사전 선택, jar의 META-INF/클래스 메타(메뉴 문자열, resource bundle properties) 정적 추출, 공공기관 앱의 번들 JRE 위치 탐지 [inference].

## F3 GTK on Windows

1. 현황
- GTK 4.18에서 AccessKit 백엔드 병합, "처음으로 Windows/macOS에서 접근 가능". 빌드 옵션 `-Daccesskit=enabled` + 환경변수 `GTK_A11Y=accesskit` [fact-cited 13]. UIA 노출 여부는 글에 없음 [미확인].
- 이전: Windows/macOS 접근성 없음, NVDA가 창 제목만 읽음 [fact-cited 14; 포럼 답변].
- GIMP/Inkscape 등 배포 바이너리가 4.18+ 이고 옵션을 켠 빌드인지 [미확인].
2. 왜 없나: 기술 벽(과거 백엔드 부재). 자동화 도구 사례도 못 찾음 [inference].
3. 한계/돌파: 배포 빌드가 accesskit 미포함이면 환경변수로 해결 불가(빌드 옵션). 범위 내 돌파는 `GTK_A11Y` 설정과 좌표/스크린샷 폴백뿐.
4. 우리 가치: libgtk 버전(3 vs 4.18+) 판별, 번들된 .ui(Glade/Builder XML)·GSettings 스키마·.desktop 정적 읽기로 메뉴/액션 이름 복원. 이 계열에서 AppHelm 정적 읽기 가치가 가장 큼 [inference; .ui가 gresource에 컴파일 내장될 수 있어 추출 가능 여부 미확인].

## F4 Flutter desktop

1. 현황
- Windows 임베더: WM_GETOBJECT 응답, AXPlatformNodeWin이 MSAA IAccessible과 UIA fragment 겸용, SemanticsNode::identifier -> AutomationId [fact-cited 11].
- 테스트: `integration_test`가 Windows 지원, 단 앱 코드에 Key 부여/루트 위젯 노출 필요(앱 내부 하네스) [fact-cited 12]. 외부 앱 대상 불가.
- 시맨틱스 트리: 표준 위젯은 자동 생성, 웹은 수동 토글 [fact-cited 10]. 데스크톱에서 "스크린리더 감지 전 off" 여부는 문서에서 확인 못 함 [미확인].
2. 왜 없나: 외부 자동화 도구 사례 자체를 못 찾음 [inference]. 공식 대안은 앱 내부 integration_test뿐.
3. 한계/돌파: Semantics 라벨 누락 위젯은 이름 없는 노드, 커스텀 페인트 위젯 불가시 [inference]. 돌파: UIA 클라이언트 접속(=WM_GETOBJECT) 자체가 공식 경로. 앱이 `ensureSemantics()` 호출하면 상시 on [fact-cited 10, 웹 맥락].
4. 우리 가치: flutter_windows.dll + data/app.so, flutter_assets(AssetManifest, 폰트, l10n 문자열) 정적 읽기로 사용 문자열 확보. AOT 코드는 해석 불가이므로 위젯 트리 복원은 한계 [inference].

## 6축 표 (대표 앱)

| 앱 | 1 텍스트 | 2 합성입력 | 3 캡처 | 4 레이아웃 | 5 사이드채널 | 6 화면 |
|---|---|---|---|---|---|---|
| 키움 영웅문 등 Qt HTS | 부분 접근성(Qt 버전별) [inference] | SendInput 가능 추정 | 일반 | 스크롤동적(차트/호가) | 스크립팅 API(OpenAPI+) [미확인 18] | 창 |
| 디자인툴 Qt | 부분 | 가능 추정 | 일반 | 고정+패널 | 스크립팅 일부 | 창 |
| Eclipse(SWT) | JAB로 부분~충분 | 가능 | 일반 | 고정 | 스크립팅/플러그인 API | 창 |
| 공공기관 Swing | JAB 의존(기본 off) | 가능 | 일반 | 고정 | 없음 | 창 |
| GIMP/Inkscape | 부분/없음(빌드 의존) | 가능 | 일반 | 고정 | 스크립팅(Script-Fu, CLI) | 창 |
| Flutter 데스크톱 앱 | 부분(Semantics 품질 의존) | 가능 추정 | 일반 | 고정~스크롤동적 | 없음 | 창 |

표의 값은 대부분 [inference]: 대표 앱 실물 확인 안 함.

## 종합
- 브리지 활성 스위치가 핵심: Java(`jabswitch`), GTK(`GTK_A11Y`, 빌드 의존), Qt(`QT_ACCESSIBILITY`, 구버전).
- AppHelm 차별점은 "실행 전 정적 판별": 툴킷 DLL 검출 -> 접근성 기대치/폴백 경로 사전 판정.

## 출처
1. https://doc.qt.io/qt-6/accessible.html (1st)
2. https://doc.qt.io/qt-4.8/accessible.html (1st, 구버전)
3. https://qt-project.org/doc/d7/d16/qwindowsuiaaccessibility_8cpp_source.html (1st)
4. https://code.qt.io/cgit/qt/qtbase.git/log/src/plugins/platforms/windows/uiautomation (1st)
5. https://docs.oracle.com/en/java/javase/21/docs/specs/man/jabswitch.html (1st)
6. https://cs.longwood.edu/java/docs/technotes/guides/access/enable_and_test.html (Oracle 가이드 미러)
7. https://support.hyland.com/r/Hyland-RPA/Installation-and-Update/Foundation-23.2/Hyland-RPA-Installation/Hyland-RPA-Designer-and-Activities-Installation/Enabling-the-Java-Access-Bridge
8. https://github.com/gaozhao1989/pyjab (1st, 도구 저장소)
9. https://wiki.eclipse.org/SWTBot/Releases (1st)
10. https://docs.flutter.dev/ui/accessibility/assistive-technologies (1st)
11. https://flutter.googlesource.com/mirrors/flutter/+/HEAD/docs/platforms/desktop/windows/Accessibility-on-Windows.md (1st)
12. https://docs.flutter.dev/testing/integration-tests (1st)
13. https://blog.gtk.org/2025/05/12/an-accessibility-update/ (1st)
14. https://discourse.gnome.org/t/rust-gtk4-apps-how-to-access-applications-using-nvda-on-windows/24631 (포럼)
15. https://www.qt.io/product/quality-assurance/squish (1st, 벤더)
16. https://pywinauto.readthedocs.io/en/latest/contents.html (1st)
17. https://cdn.jsdelivr.net/npm/compact-agent@1.35.0/resources/ecc/skills/windows-desktop-e2e/SKILL.md (비공식)
18. https://wikidocs.net/5856 (블로그성)

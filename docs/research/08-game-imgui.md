# 08. 게임 엔진 UI · 즉시모드 UI (G3, G4) 자동화 현황

조사일 2026-10-26. 태그: [fact-cited] 출처번호 / [inference] / [assumption] / [미확인] = 블로그·2차 요약만. 로컬 실측 없음(해당 앱 미설치 확인 안 함, 정적 map 미실행).

## G3. 게임 엔진 UI (Unity / Unreal)

### 1. 현황
- **AltTester** (Unity SDK): 빌드에 SDK 삽입 필수, 디버그 빌드용, 릴리스 빌드에서 기본 불가. 오브젝트 탐색+조작을 C#/Python/Java 테스트로 수행 [fact-cited][1]. 122 stars, GPL-3.0, 최종 push 2026-09-23, open issue 123 [fact-cited][2].
- **GameDriver**: Unity/Unreal 대상 상용 프레임워크. HierarchyPath(HPath)로 오브젝트 지정, 입력 시뮬레이션, UI Toolkit 지원 [fact-cited][3][4]. 게임 쪽 에이전트 통합이 전제 [inference]. 가격·stars 미확인.
- **Unreal Automation / Gauntlet**: Gauntlet은 멀티플랫폼 세션 실행·결과 검증 프레임워크, 게임 쪽 테스트 코드는 개발자 몫 [fact-cited][5]. 패키지 클라이언트 대상 테스트 가능 [fact-cited][6]. Automation Driver(UI 입력 시뮬) [미확인][7].
- **Unity Accessibility 모듈**: AccessibilityHierarchy/Node를 앱이 직접 구성해야 스크린리더(Narrator 등)에 노출. 노드 없으면 안 보임. Windows/macOS/Android/iOS 지원 [fact-cited][8][9]. 외부 자동화 용도 아님(문서에 언급 없음) [fact-cited][9].
- **에디터 MCP**: CoplayDev/unity-mcp 15.4k stars(2026-10-19 push), mcp-unity 2.0k, unreal-mcp 2.1k(2025-04 이후 정체) [fact-cited][10]. 에디터 조작용이며 배포 빌드 대상 아님 [inference].
- **게임 에이전트**: Cradle (스크린샷 입력, 키보드·마우스 출력, 게임 4종·SW 5종 시험; 2.6k stars, 마지막 push 2024-11, MIT) [fact-cited][11][12]. SIMA 2(DeepMind, 2025-11, Gemini 기반 3D 게임 에이전트) [fact-cited][13] 입출력 인터페이스는 확인 못함. 비공개 연구물 [inference].
- **비전 RPA/파서**: OmniParser 25.5k stars, CC-BY-4.0, 최종 push 2026-07 [fact-cited][14]. Microsoft UFO 10.1k stars, MIT, UIA·Win32·COM + 시각 혼합 [fact-cited][15]. SikuliX는 2.0.5로 종료, 상위 저장소 2026-03 아카이브, 후속 OculiX [fact-cited][16]. UiPath CV/OCR은 Citrix류에서 OCR 폴백, 정확도 100% 아님 [fact-cited][17]. UiPath CV의 게임 적용 사례는 [미확인].

### 2. 없다면 왜
- 배포 빌드용 범용 도구는 없음: **기술 장벽**(UIA 트리 부재) + **공식 대안은 빌드 내 삽입형**(AltTester/GameDriver/Gauntlet 모두 개발사 협조 전제) [inference].
- 수요는 있으나(게임 QA) 개발사 내부 도구로 해결되어 외부 서드파티 수요가 작음 [inference].

### 3. 한계와 돌파 (범위 내)
- 막히는 곳: UIA 트리 없음, 풀스크린 DirectX 캡처, 입력 무시, 해상도·DPI별 좌표 변동 [inference; 일반 비전 RPA 한계 근거 [17]].
- UE 콘솔은 shipping 빌드에서 기본 제거(ALLOW_CONSOLE_IN_SHIPPING 기본 0) [미확인: 커뮤니티 포럼 [18]] → 콘솔 가능 여부는 빌드별 정적 판별 필요.
- 돌파: (a) 출하 데이터(로컬라이제이션 문자열 테이블, Unity `*.assets`/UE `.locres`의 평문 UI 문자열)를 정적으로 읽어 OCR 사전으로 제한 [inference]; (b) 공식 모드/플러그인 지원이 있는 게임은 그 표면 사용; (c) Accessibility 모듈을 켠 게임은 Windows에서 UIA로 노드가 보일 가능성 → 실측 필요 [assumption]; (d) 창 모드 고정 해상도에서 좌표 맵 생성.

### 4. 우리 가치
- 출하 문자열로 OCR 후보 집합을 제한해 정확도·속도 개선, 메뉴 구조 사전 지도화 [inference].
- 엔진 런타임 DLL(UnityPlayer.dll, UE 바이너리) 판별 후 "트리 없음 → 비전 경로" 자동 분기 [inference].
- 에디터 MCP/AltTester가 못 하는 **무삽입·배포 빌드** 영역 [inference].

## G4. 즉시모드 UI (Dear ImGui)

### 1. 현황
- **Dear ImGui Test Engine**: 마우스/키보드/게임패드 입력 주입, 경로 참조(`//창/메뉴/항목`)로 지정, 헤드리스·스크린샷·영상 지원. C++ 전용, 앱 소스에 통합 필수. 라이브러리는 별도 라이선스(개인·소규모 무료, 대기업 유료), 638 stars, 2026-10-14 push, open issue 27 [fact-cited][19][20].
- 접근성: ImGui는 네이티브 위젯·UIA 트리를 노출하지 않음. 커뮤니티 논의로만 확인, 공식 백엔드 미발견 [미확인][21]. AccessKit 같은 래퍼가 언급됨 [미확인][21].
- 외부 도구: SikuliX/OmniParser/UFO 비전 경로가 사실상 유일 [inference].

### 2. 없다면 왜
- 외부(배포본) 자동화 없음: **기술 장벽**. 위젯 트리가 매 프레임 재구성되고 외부에서 노출되지 않음. 공식 대안(Test Engine)은 내부 통합형 [inference + [19]].

### 3. 한계와 돌파
- 막힘: 트리 없음, 텍스트도 자체 폰트 렌더링(OCR 필수), 테마·DPI·폰트 크기에 따른 좌표 변동 [inference].
- 돌파: 레이아웃이 imgui.ini(창 위치·크기 저장)로 고정되는 경우 좌표 맵 재사용 [assumption: 앱이 ini를 쓰는 경우]; 바이너리 내 평문 문자열(메뉴·라벨)을 정적 추출해 OCR 사전화 [inference]; 앱이 자체 커맨드 라인·단축키를 제공하면 키 입력 사용(PE 단축키 표는 ImGui에 없음).

### 4. 우리 가치
- 바이너리 문자열 추출 → 라벨 사전 → OCR 후 라벨-좌표 맵 저장(고정 레이아웃 지도) [inference]. 일반 비전 에이전트는 매번 전체 화면 해석, AppHelm은 사전 지식으로 비용 절감 [inference].

## 6축 표 (대표 앱, 전부 [inference] — 실측 전)

| 앱 | ①텍스트 | ②입력 | ③캡처 | ④레이아웃 | ⑤사이드채널 | ⑥화면 |
|---|---|---|---|---|---|---|
| Unity 게임(일반) | 없음→OCR (Accessibility 켠 경우 부분) | SendInput 대체로 OK(Raw Input 사용 시 무시 가능) | 보통(풀스크린 독점 시 불안정) | 고정(메뉴)/동적(인게임) | 없음, 일부 모드콘솔 | 창/풀스크린 혼재 |
| Unreal 게임 | 없음→OCR | 동일 | 동일 | 동일 | 콘솔은 빌드별(shipping 기본 제거) | 혼재 |
| Unity/UE 기반 툴 | 부분(앱 문자열 자산) | OK | 보통 | 고정 | 스크립트 API 가능 | 창 |
| Dear ImGui 툴 | 없음→OCR | 보통 OK(백엔드별) | 보통 | 고정(ini) | 없음 | 창 |
| 안티치트/DRM 게임 | 없음 | 차단 가능 | 검정 가능 | 가변 | 없음 | 풀스크린 | 

(범위 밖: 온라인 게임·안티치트 우회는 대상 제외.)

## 출처
1. https://alttester.com/docs/sdk/pages/get-started.html (1st)
2. https://github.com/alttester/AltTester-Unity-SDK (GitHub API 조회) (1st)
3. https://kb.gamedriver.io/hierarchypath-plugin-driven-testing (1st)
4. https://kb.gamedriver.io/automating-uitoolkit-testing-in-unity-with-gamedriver (1st)
5. https://dev.epicgames.com/documentation/unreal-engine/gauntlet-automation-framework-overview-in-unreal-engine (1st)
6. https://dev.epicgames.com/documentation/en-us/unreal-engine/running-gauntlet-tests-in-unreal-engine (1st)
7. https://dev.to/gamedevtoollab/testing-in-unreal-engine-5-cqtest-automation-spec-functional-tests-and-ci-3776 (2차)
8. https://docs.unity3d.com/ScriptReference/Accessibility.AccessibilityHierarchy.html (1st)
9. https://docs.unity3d.com/Manual/accessibility/screen-readers-get-started.html (1st)
10. https://github.com/CoplayDev/unity-mcp , https://github.com/CoderGamester/mcp-unity , https://github.com/chongdashu/unreal-mcp (GitHub API) (1st)
11. https://github.com/BAAI-Agents/Cradle (1st)
12. https://arxiv.org/pdf/2403.03186v1 (1st)
13. https://deepmind.google/blog/sima-2-an-agent-that-plays-reasons-and-learns-with-you-in-virtual-3d-worlds/ (1st)
14. https://github.com/microsoft/OmniParser (1st)
15. https://github.com/microsoft/UFO (1st)
16. https://github.com/RaiMan/SikuliX1 (1st)
17. https://docs.uipath.com/activities/other/latest/ui-automation/known-issues-and-limitations-citrix (1st; 포럼 요약은 2차)
18. https://forums.unrealengine.com/t/enable-console-in-shipping-build/353468 (커뮤니티)
19. https://github.com/ocornut/imgui_test_engine (1st)
20. https://github.com/ocornut/imgui (1st, 76.8k stars, MIT)
21. https://ziggit.dev/t/accessible-immediate-mode-guis/12210 (커뮤니티)

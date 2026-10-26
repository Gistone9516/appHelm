# 07. 커스텀 업무앱 · 문서/캔버스앱 자동화 현황 (G1, G2)

조사일 2026-10-26. 태그: [fact-cited]=출처 번호 명시, [inference]=추론, [미확인]=단일 2차 요약만 근거.
로컬 측정: 이 PC에 `HWPFrame.HwpObject` 레지스트리 키 없음, Hwp.exe/Photoshop/AutoCAD 미설치 확인 -> `map` 실측 불가 [fact: reg query 실패, 경로 탐색 결과 없음].

## G1. 메신저·커스텀 업무앱 (KakaoTalk)

**1. 현황**
- kronenz/kakaotalk-mcp: Win32 API + 키보드 시뮬레이션 + 클립보드로 PC 카톡 제어. 13개 도구(방 열기, 전송, 일괄전송, 읽기, 키워드 모니터링 등). Glama 유지보수 상태 "Inactive". [fact-cited][4]
- 상용 매크로(크몽 등): 복사/붙여넣기 방식 발송, 도배성 발송 시 운영정책 제재 경고 문구. [fact-cited][5]
- 안드로이드 메신저봇R: 알림 기반. 입퇴장 감지 불가, DB봇은 루팅 필요라는 주장은 판매글 출처 [미확인][6]. "약관 위반·정지" 주장은 근거 없는 포럼 발언 [미확인][7].
- 공식: 카카오 오픈채팅 챗봇 베타(방장이 봇 초대) [fact-cited 2차 요약][8] [미확인].
- pywinauto 기반 PC 카톡 봇의 GitHub 프로젝트는 검색에서 특정하지 못함. 별/커밋 수치 미수집.

**2. 없다면 왜**
- 수요는 있음(상용 매크로 다수). 공개 오픈소스가 빈약한 이유: 약관/제재 리스크 + 창 클래스 커스텀드로우(EVA)로 UIA 빈약 [inference].
- 공식 대안은 오픈채팅 봇/알림톡(비즈니스 메시지)뿐이며 개인 채팅 읽기 API는 없음 [inference].

**3. 한계와 돌파**
- 공통 한계(kakaotalk-mcp 문서): 창 전면화 필요, 클립보드 덮어씀, 방 이름=창 제목 일치, 폴링 최소 3초. [fact-cited][4]
- 돌파(범위 내): (a) UIA Value 패턴으로 입력창에 직접 쓰기(AppHelm 검증됨 -> 클립보드 오염 없음). (b) 목록은 스크린샷+OCR+좌표클릭. (c) 읽기는 앱 자체의 복사 기능(Ctrl+A/C)로 사람과 동일 경로.
- 경계: 로컬 DB는 암호화 -> 복호화 읽기는 범위 밖. 이 이유로 side channel = 사실상 없음으로 분류.

**4. 우리 가치**
- 클립보드·전면화 의존을 줄인 UIA 입력 + 읽기 전용 조언자 모드(사용자가 쓰는 입력창 내용을 관찰). 일괄발송/스팸은 비범위.
- 실시간 읽기: 이벤트 없음. UIA 폴링(입력창 Value) 또는 스크린샷 OCR 폴링만 가능 [inference].

## G2. 스크립팅 API를 가진 문서/캔버스앱

### 한글(HWP)
**1. 현황**
- pyhwpx(martiniifun): win32com HwpObject 래퍼. MIT, 59 stars, 17 forks, 787 commits, `Hwp()` 생성 시 보안모듈 자동 등록, Windows+한글 설치 필수. 마지막 커밋일·이슈 수는 페이지에서 미확인. [fact-cited][1]
- hwp MCP: jkf87/hwp-mcp, crowwan/hwp-mcp-advanced-custom 등(win32com, 문서 생성/찾기바꾸기/서식/표/이미지); HWPX 직접 편집형 npm "HWPX MCP Server"(도구 132개 주장, 한글 불필요) [fact-cited 2차 요약][2] [미확인].
- python-hwpx: 한글 없이 HWPX(ZIP+XML) 편집, Alpha 명시. [fact-cited][3]
- 보안모듈: `HKCU\SOFTWARE\HNC\HwpAutomation\Modules`에 값 이름=모듈명, 데이터=DLL 전체경로(따옴표 금지) 등록 후 `hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule...")`. 실패(False) 원인: DLL 부재/인자/권한. [fact-cited][9][10] (한컴 공식 API 문서 본문은 직접 열지 못함 -> 보안모듈 목적은 [미확인])

**2. 없다면 왜**: 해당 없음(활발). 공식 대안=HwpAutomation(COM) + HWPX 개방 포맷.

**3. 한계와 돌파**
- 경로 접근 시 보안 팝업 -> 보안모듈 등록으로 해결(인프런 질의 다수 [fact-cited][10]). 단일 인스턴스·UI 스레드 직렬 호출 [inference].
- 돌파: 레지스트리 모듈 등록은 한컴이 제공한 공식 절차이므로 범위 내. 한글 미설치 환경은 HWPX 파일 직접 읽기.

**4. 우리 가치**
- 한글 설치본의 COM 타입라이브러리/액션 ID/메뉴 리소스를 정적 추출해 "AI 지침서"로 만들기: 기존 도구는 pyhwpx 쿡북처럼 사람이 쓴 문서에 의존. 이 PC엔 한글 없어 실측 불가.
- 실시간 조언: HwpObject에서 변경 이벤트를 다루는 공식 자료는 찾지 못함 [미확인]. 현실적 방식은 주기적 텍스트 취득+스냅샷 diff 폴링 [inference]. 읽기 전용 교정 조언자는 가능하나 폴링 비용·편집 중 락 영향은 실측 필요.

### Photoshop
**1. 현황**: loonghao/photoshop-python-api-mcp-server — 342 stars, 이슈 3/PR 22 열림, Windows COM 전용, CC2017~2024 검증, `photoshop_execute_jsx`(ExtendScript) 제공, 마지막 커밋일 미확인. [fact-cited][11] 그 외 TypeScript판, macOS AppleScript판, ps-mcp(UXP/ExtendScript) 존재 [미확인][12]. Adobe UXP: `batchPlay`, DOM API, 이벤트 `action.addNotificationListener`(PS 23.0+), `core.addNotificationListener`. [fact-cited][13][14]
**2**: 공식 스크립팅 존재, 수요 많음.
**3 한계/돌파**: ExtendScript는 ES3·구식, UXP로 이행 중 [inference]. 이벤트 'all' 리스너는 개발용만, 운영 불가 [fact-cited 2차][14]. 돌파: 이벤트 구독은 UXP 플러그인(공식 설치)로 범위 내.
**4 가치**: 앱 구조 추출+지침서화는 기존 MCP가 도구 몇 개를 수작업으로 노출하는 것과 대비. 실시간: UXP 이벤트로 연속 관찰 가능(코드 주입 아님, 공식 플러그인 경로).

### CAD (AutoCAD)
**1**: 다수 MCP(U-C4N/autocad-mcp COM+ezdxf, puran-water/autocad-mcp LT용 AutoLISP IPC) — 대부분 ActiveX/COM, Windows 전용, COM 호출 직렬화. [fact-cited 2차][15] [미확인]
**3**: AutoCAD 자동화 세션 단일 스레드. **4**: 타입라이브러리 기반 지침서 생성, ezdxf 같은 오프라인 경로와 구분.

## 6축 표

| 앱 | 1 텍스트 추출 | 2 합성입력 | 3 캡처 | 4 레이아웃 | 5 부가채널 | 6 화면 |
|---|---|---|---|---|---|---|
| KakaoTalk PC | 일부 접근성(입력창 UIA, 목록 없음) + 앱 복사 | SendInput 가능 [AppHelm 입력 검증은 UIA Value] | 일반 [inference] | 스크롤 동적 | 로컬 DB(암호화, 범위 밖) -> 사실상 none | 창 |
| 한글 | 스크립팅 API로 본문 취득 | 가능 [inference] | 일반 [inference] | 고정(문서 영역) | 스크립팅 API(HwpObject, 보안모듈) | 창 |
| Photoshop | 레이어/텍스트는 API, 캔버스는 비전 | 가능 [inference] | 일반 [inference] | 고정(패널 도킹) [inference] | 스크립팅 API(COM/UXP/ExtendScript) | 창 |
| AutoCAD | 도면 엔티티는 API | 가능 [inference] | 일반 [inference] | 고정 [inference] | 스크립팅 API(COM/LISP) | 창 |

## 출처
1. https://github.com/martiniifun/pyhwpx
2. https://glama.ai/mcp/servers/@jkf87/hwp-mcp/blob/main/hwp-mcp-구조설명.md (+ crowwan/skerishKang 포크 README, npm HWPX MCP: 검색요약)
3. https://github.com/airmang/python-hwpx
4. https://glama.ai/mcp/servers/m0lds2ae15
5. https://kmong.com/gig/755316
6. https://kmong.com/gig/791867
7. https://devtalk.kakao.com/t/topic/132177
8. https://www.fnnews.com/news/202607151001426388
9. https://forum.developer.hancom.com/t/c/782
10. https://www.inflearn.com/community/questions/1058541/hwp-registermodule-quot-filepathcheckdll-quot-quot-filepathcheckermodule-quo
11. https://github.com/loonghao/photoshop-python-api-mcp-server
12. https://glama.ai/mcp/servers/ceyn0cfayc
13. https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/batchplay
14. https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/eventcodes
15. https://github.com/puran-water/autocad-mcp

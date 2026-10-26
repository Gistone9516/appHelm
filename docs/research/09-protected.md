# G5 보호/안티오토메이션 앱 조사 (AppHelm 한계선)

목적: 돌파가 아니라 경계 정의. 탐지 -> 중단 -> "사람 필요" 인계 + 공식 대안 안내.
태그: [fact-cited] 출처번호 / [inference] / [assumption] / [미확인]

## 1. 현황 (보호 수단이 자동화에 하는 일)

- 입력 계층 (OS 공통)
  - SendInput은 UIPI 대상. 상위 무결성 프로세스에는 주입 실패, 실패 원인은 반환값/GetLastError로 구분 불가 [fact-cited][1]
  - 저수준 키보드 훅은 LLKHF_INJECTED(0x10)로 주입 이벤트를 구분 가능. 낮은 IL 주입은 LLKHF_LOWER_IL_INJECTED [fact-cited][2]
  - UIA 기반 보조기술도 UIAccess 서명/설치 위치 조건 없이는 상위 IL UI 접근 불가. SYSTEM IL(UAC 데스크톱)은 UIAccess로도 불가 [fact-cited][3]
  - 시사점: "주입 입력은 보호 프로그램이 식별 가능"은 OS 사양 [fact-cited][2]. 특정 제품이 이를 실제로 차단하는지는 제품별 [미확인]
- 화면 계층
  - SetWindowDisplayAffinity: WDA_MONITOR는 모니터 외 캡처에서 내용 없음(검정), WDA_EXCLUDEFROMCAPTURE(Win10 2004+)는 창 자체가 캡처에서 사라짐 [fact-cited][4]
  - MS 스스로 "DRM이 아니며 카메라 촬영은 못 막는다"고 명시 [fact-cited][4]
  - 같은 프로세스 소유 창만 설정 가능 [fact-cited][4]. 따라서 외부에서 읽기(GetWindowDisplayAffinity)는 가능 [fact-cited][4, 함수 존재 언급]
- 한국 키보드보안(TouchEn nxKey, 안랩 Safe Transaction 등)
  - 목적은 키로거 방지, 일반 키 입력 경로를 가로채는 구조라 외부 도구 입력이 막히는 것은 설계상 예상 [inference]
  - 제품 사양 1차 출처 확보 실패(벤더 사이트 리다이렉트/404) [미확인]
- 가상(랜덤) 키패드: 버튼 배치가 매번 바뀌어 좌표 고정 불가, 화면 읽기(OCR/비전)만 가능 [inference]. 단 금융 약관상 사람 입력 전제 (2절)
- 게임 안티치트
  - BattlEye: 커널 수준, 게임 프로세스가 로드하는 파일 검사, 필수 아닌 파일 차단 가능, 매크로 도구는 밴이 아닌 킥 가능 [fact-cited][5]
  - Riot Vanguard: 게임 미실행 시에도 상주(2차 자료) [미확인]
- 기존 자동화 도구 문서: UiPath/Automation Anywhere/pywinauto/AHK 공식 문서에서 보안키보드 명시 한계 문구를 찾지 못함. 검색 결과는 일반 지원 기술 목록뿐 [미확인]. Alibaba Cloud RPA 문서에 보안 컨트롤 입력 사례가 있으나 자사 도구 기능이라 일반화 불가 [미확인]

## 2. 없다면 왜

- 기술 벽: 위 1절. 벽은 의도적 설계(키로거/화면유출/치트 방어)이며 자동화 도구와 구분하지 못함 [inference]
- 법/약관
  - 전자금융거래법 제21조: 금융회사는 "선량한 관리자로서의 주의"로 거래 안전 확보 [fact-cited][6]
  - 같은 법 제6조 제3항(접근매체 대여/질권 금지), 제49조 제4항 벌칙 3년 이하 징역 또는 2천만원 이하 벌금 [fact-cited][6, 위키문헌 사본]. law.go.kr 직접 열람 실패, 원문 대조 필요
  - 키보드보안 설치를 직접 의무화한 조문은 확인 못 함 [미확인]. 법적 근거는 감독규정 쪽일 수 있음 [assumption]
  - 인증정보를 AI에 위임하는 행위가 접근매체 "대여"에 해당하는지는 법률 해석 사안 [미확인] -> 법무 검토 필요
  - Riot ToS 7.1: "unauthorized third party programs, including ... scripts, bots ... automation programs" 금지, 우회 금지, 하드웨어 밴 [fact-cited][7]
  - BattlEye: 우회 구성요소/치트 밴, 일부 도구는 게임별 차단 [fact-cited][5]
  - 정보통신망법 적용 여부는 이번에 1차 확인 못 함 [미확인]

## 3. 한계와 돌파 (공식 대안만)

- 증권/HTS: KIS Developers(REST/WebSocket, appkey, MCP 도구 제공) [fact-cited][8]; 키움 OpenAPI+(Windows OCX, 조회 제한 초당5/분100/시1000, 알고리즘 계정 등록 가능성 명시) [fact-cited][9]
- 은행/결제: 금융결제원 오픈뱅킹 공동업무 [8번 페이지 내용 미수신, 개요 미확인][10]. 이용기관 등록이 필요해 개인 사용자 직접 호출 가능 여부 [미확인]
- 키보드보안/가상키패드: 공식 우회 모드 없음 [inference]. 해당 단계는 사람이 입력 (인계)
- 은행 거래내역: 은행 제공 내보내기(엑셀/PDF) 사용 후 AppHelm은 파일을 읽음 [inference, 기능 존재는 은행별 확인 필요]
- DRM 영상: 공식 다운로드/오프라인 재생, 자막/대본 제공 기능. 캡처 시도 금지 [inference]
- 게임: 공식 API/모드 지원이 있는 경우만(게임별). 없으면 대상 제외 [inference]
- 접근성: UIAccess는 MS가 정의한 보조기술 경로이나 보호 소프트웨어가 이를 허용한다는 보장 없음 [fact-cited][3 + inference]

## 4. 우리 가치 (정적 탐지 + 인계 UX)

탐지 원칙: 시도 전에 읽기 전용 신호로 G5 분류, 해당 시 조작 중단.

| 신호 | 읽는 방법 | 분류 | 근거 |
|---|---|---|---|
| 창 display affinity != 0 | GetWindowDisplayAffinity (읽기) | 캡처 불가(DRM 계열) | [4] |
| 서비스/드라이버 존재: vgk, vgc, EasyAntiCheat, BEService/BEDaisy, npggNT, xhunter 등 | 서비스/드라이버 목록 조회 | 안티치트 설치(게임류) | 이 PC 실측: vgk(Running), vgc(Stopped) 확인, 나머지 이름은 매칭 없음 |
| 키보드보안 모듈: nxKey/TouchEn, nProtect, AhnLab Safe Transaction, Veraport/Delfino/Wizvera 서비스·프로세스·설치 폴더 | 서비스·프로그램 목록·대상 exe의 로드 DLL 이름 | 보안키보드 존재 가능 | 이 PC 실측: 해당 서비스 없음. DLL 이름은 [assumption] |
| 대상 exe의 임포트/리소스 | PE 정적 분석(AppHelm 기존 능력) | 보호 DLL 문자열 | [inference] |
| 대상 프로세스 IL이 AppHelm보다 높음 | 토큰 무결성 조회 | UIPI 차단 예상 | [1][3] |
| 입력 후 무반응/캡처 전체 검정 | 시도 후 사후 검증 | 런타임 확인 | [inference] |
| 도메인 분류: 은행/증권 로그인 화면 | 창 제목/URL 패턴 | 인증 단계 | [assumption] |

인계 UX
- 중단 문구: "이 단계는 보안 프로그램/인증정보 입력이 필요해 사람이 직접 해야 합니다."
- 해당 단계만 사람에게 넘기고, 완료 후 AppHelm이 이어받기 (이후 화면이 일반이면)
- 같은 목적의 공식 대안(KIS/키움 API, 오픈뱅킹, 내보내기) 링크 제안
- 실패 재시도 금지 (안티치트 계정 제재 위험 [7])
- 한 번 G5 판정 시 해당 앱에 캐시, 사용자 확인 후만 해제

## 6축 대표 앱 배치 (모두 [inference], 실측 아님)

| 앱 | 텍스트 | 합성입력 | 캡처 | 레이아웃 | 사이드채널 | 화면모드 |
|---|---|---|---|---|---|---|
| 은행 로그인(보안키보드) | 부분 접근성 | 차단 가능 | 일반 | 랜덤(가상키패드) | 오픈뱅킹 API(기관 등록 시) | 창 |
| 증권사 HTS 주문창 | 부분/없음 | 차단 가능 | 일반 | 고정 | OpenAPI(KIS/키움) | 창 |
| DRM 영상 플레이어 | 없음 | 일반 | 검정/제외 | 고정 | 공식 오프라인 기능 | 창/전체 |
| 안티치트 게임(Valorant 등) | 없음(OCR) | 차단/제재 위험 | 일반 | 동적 | 없음(공식 모드 없음) | 전체화면 위주 |

## 출처
1. https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput (1차)
2. https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-kbdllhookstruct (1차)
3. https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview (1차)
4. https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity (1차)
5. https://www.battleye.com/faq/ (1차)
6. https://ko.wikisource.org/wiki/전자금융거래법 (2차 사본, law.go.kr 열람 실패)
7. https://www.riotgames.com/en/terms-of-service (1차)
8. https://apiportal.koreainvestment.com/intro (1차)
9. https://www.kiwoom.com/h/customer/download/VOpenApiInfoView (1차)
10. https://openapi.kftc.or.kr/ (1차, 내용 수신 실패)

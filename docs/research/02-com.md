# G2 COM 계열 현황 조사 (B1 Office / B2 비-Office COM / B3 SAP GUI Scripting)

조사일 2026-10-26. 태그: [fact-cited N] = 출처 번호, [inference], [assumption], [미확인] = 1차 근거 없음. 로컬 측정은 하지 않음(정적 측정 생략).

## B1 COM/Office (Word, Excel, PowerPoint)

1. 현황
- mcp-office(dosev-ai): excelmcp 65 / pptmcp 51 / wordmcp 50 도구. 스타일·PDF내보내기·변경추적은 COM, 읽기는 python-docx/openpyxl/python-pptx. Windows 전용, 별 8, 커밋 51 [fact-cited 1]
- excel-mcp-server(haris-musa): openpyxl 기반, Excel 불필요, 별 4.3k. 수식 약 260개만 자체 계산, RAND 등 휘발성 미계산, 피벗 새로고침·도형·스파크라인 편집 불가, VBA 쓰기 기본 off [fact-cited 2]
- OfficeMCP(PyPI)·jenstangen1/pptx-xlsx-mcp: pywin32 COM. 임의 Python 실행 도구 포함 경고 [fact-cited 3] (검색 요약, 저장소 원문 미열람 [미확인])
- 공통점: 객체모델(Range, Slide 등) 호출 위주. 리본 명령(ExecuteMso)·명령 카탈로그를 노출하는 MCP는 확인 못함 [inference: 검색 3건 기준, 부재 증명 아님]
- ExecuteMso: 객체모델에 없는 명령 실행용. 잘못된 idMso는 E_InvalidArg, 비활성/비표시는 E_Fail [fact-cited 4]
- Copilot in Office는 MS 자체 통합이며 외부 에이전트용 표면은 아님 [미확인, 이번에 원문 미열람]

2. 없다면 왜
- 객체모델이 넓어 "typelib 덤프+명령 카탈로그"가 꼭 필요하다는 수요가 약했음 [inference]
- 공식 대안 존재: 객체모델, Open XML SDK류. 무인/서버측 Office 자동화는 MS가 지원하지 않음(교착·불안정) [fact-cited 5]

3. 한계와 돌파
- 한계: COM 서버 라이브러리(openpyxl 계열)는 계산·피벗·차트 충실도 부족 [fact-cited 2]. 임의 코드 실행 도구는 안전 경계 불명 [fact-cited 3]
- 돌파(범위 내): 설치된 Office 자체를 대상으로 하여 계산·렌더링 충실도 확보. ExecuteMso는 활성 상태 확인 후 호출(E_Fail 대비). 대화상자·보호된 보기는 UIA/좌표 보조로 처리 [inference]
- 무인 실행 금지: 사용자 대화형 세션에서만 구동 [fact-cited 5]

4. 우리 가치
- 우리: Word typelib 12,162 멤버 덤프, idMso 299 + 컨트롤 1,247 카탈로그 (AppHelm 내부 측정, 이번 세션 재측정 안 함)
- 타사는 도구 수십 개로 고정된 반면, AppHelm은 typelib+idMso를 문서화해 "임의 멤버/명령"을 AI가 읽고 호출 가능 [inference]
- 지침서(AI 읽기용 문서)라는 산출물 자체가 차별점 [inference]

## B2 비-Office COM (AutoCAD, ActiveX 서버)

1. 현황
- U-C4N/Autocad-MCP(autocad-mcp-pro): COM 라이브 또는 ezdxf 헤드리스, 87~131개 도구(버전 간 차이), 자체 벤치마크 주장 [fact-cited 6, 자체 주장]
- puran-water/autocad-mcp: AutoLISP File IPC(LT 2024+)·ezdxf, 도구 8개, 별 595, 열린 이슈 5, MIT. 스크린샷은 PrintWindow [fact-cited 7]
- 별도 "AutoCAD 2026 COM 전용" 서버는 COM 호출을 직렬화(자동화 세션 단일 스레드) [fact-cited 6, glama 목록 수준]
- Autodesk: ActiveX는 인-프로세스/아웃-프로세스 모두 가능, LT·Mac은 ActiveX 미지원, ProgID는 버전별(예: AutoCAD.Application.25.1) [fact-cited 8]

2. 없다면 왜
- 해당 없음(존재). 다만 일반 ActiveX 서버용 범용 도구는 확인 못함 [inference]

3. 한계와 돌파
- 한계: LT는 COM 불가 → LISP 우회 [fact-cited 7, 8]. 아웃-프로세스는 트랜잭션 불가 [fact-cited 8, 포럼 보고]. typelib 품질은 서버마다 편차 [assumption]
- 돌파(범위 내): 정식 typelib 덤프로 멤버 확인 후 호출. LT 등 COM 없는 경우 WM_COMMAND·좌표 입력으로 대체

4. 우리 가치
- 서버별 도구를 손으로 짜는 대신 typelib에서 표면을 자동 추출 → 새 ActiveX 서버도 같은 파이프라인 [inference]
- COM, 메뉴(WM_COMMAND), UIA를 한 문서에 합침 [inference]

## B3 전용 스크립팅 API (SAP GUI Scripting)

1. 현황
- 공식: SAP GUI for Windows/Java 6.20부터, 사용자 상호작용을 모사하는 객체 API, 녹화기 제공 [fact-cited 9]
- 활성화: 서버 파라미터 sapgui/user_scripting=TRUE(RZ11 임시, RZ10 영구) + 클라이언트 옵션 Enable scripting [fact-cited 10]
- RPA(UiPath 등)가 이를 사용. SAP 서버는 스크립트와 사람 입력을 구분 못함 [fact-cited 10; 구분 불가 문구는 검색 요약 [미확인]]
- SAP 대상 MCP 서버: 이번 조사에서 미확인 [미확인]

2. 없다면 왜
- 관리자가 서버에서 스크립팅을 끄는 경우가 많아 수요와 보안 정책이 충돌 [inference]

3. 한계와 돌파
- 한계: NWBC 혼용 시 선택자 오매칭, 비모달 표시 옵션 미지원 [fact-cited 10]
- 돌파: GUI 인스턴스 단일화, 모달 대화상자 설정 확인. 서버가 꺼져 있으면 스크립팅 포기하고 UIA/좌표+스크린샷 [inference]. 보안 정책 우회 시도 금지(범위 밖)

4. 우리 가치
- 스크립팅 사용 가능 여부를 먼저 진단하고, 불가 시 다른 표면으로 폴백하는 라우팅 [inference]
- SAP 화면 트리(ID 경로)를 문서화 → AI가 그대로 사용 [inference]

## 6축 표 (대표 앱)

| 앱 | 1 텍스트 추출 | 2 합성 입력 | 3 화면 캡처 | 4 레이아웃 | 5 사이드채널 | 6 화면 |
|---|---|---|---|---|---|---|
| Word/Excel/PPT | 앱 제공(객체모델·UIA 부분) | SendInput 가능 | 정상 | 고정(리본)·스크롤 동적(문서) | 스크립팅 API(COM, ExecuteMso) | 창모드 |
| AutoCAD | 부분(COM 엔티티, 캔버스는 OCR/비전) | 가능 | 정상 | 고정(리본)·캔버스 동적 | 스크립팅 API(ActiveX, LISP) | 창모드 |
| SAP GUI | 앱 제공(스크립팅 객체 트리) | 가능 | 정상 | 고정(트랜잭션별) | 스크립팅 API(서버 설정 의존) | 창모드 |

[inference: 표 전체는 문서 기반 추정, 실측 아님]

## 출처
1. https://github.com/dosev-ai/mcp-office
2. https://github.com/haris-musa/excel-mcp-server
3. https://pypi.org/project/officemcp/ (검색 요약만)
4. https://learn.microsoft.com/en-us/office/vba/api/office.commandbars.executemso
5. https://learn.microsoft.com/it-it/office/client-developer/integration/considerations-unattended-automation-office-microsoft-365-for-unattended-rpa
6. https://pypi.org/project/autocad-mcp-pro/ , https://glama.ai/mcp/servers/rqo4gfzmey (검색 요약만)
7. https://github.com/puran-water/autocad-mcp
8. https://help.autodesk.com/cloudhelp/2026/CSY/OARX-DevGuide-Managed/files/GUID-C8C65D7A-EC3A-42D8-BF02-4B13C2EA1A4B.htm , https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Customization/files/GUID-2090E4E8-9AE0-4E01-B5EB-0843A30EB0E9.htm
9. https://pages.community.sap.com/topics/gui/scripting
10. https://docs-legacy.uipath.com/studio/v2019/docs/enabling-sap-gui-scripting.html

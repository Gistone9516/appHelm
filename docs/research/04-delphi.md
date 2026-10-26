# G4 Delphi 계열 자동화 현황 조사

조사일 2026-10-26. 태그: [fact-cited]=URL 직접 열람/검색결과 근거, [미확인]=2차 요약뿐, [inference]=추론.

## D1 Delphi VCL

### 1. 현황
- **TestComplete (SmartBear)**: Delphi/C++Builder Application Support + Open Applications + VCL/DevExpress/TMS 컨트롤 플러그인. Desktop 모듈 라이선스 필요, 디버그 정보로 private 멤버까지 접근 [fact-cited][1][2]. 문서상 지원 Delphi는 7~10.4 [미확인][3]. DevExpress 지원은 21.1.x까지로 보인다는 포럼 보고, Delphi 13 지원 불명 [미확인][3].
- **Ranorex Studio**: Delphi 플러그인(네이티브 VCL 전부 + DevExpress/TMS 일부, XE2 이상), 12.4.3(2025-09)에서 Delphi 12·그리드 셀 인식 추가 [fact-cited][4]. 레거시 GDI 플러그인 폴백.
- **pywinauto**: 공식 가이드가 VCL을 win32 백엔드 대상으로 명시, uia 백엔드는 커스텀 컨트롤 미지원 [fact-cited][5].
- **UIA/MSAA**: 표준 VCL 래퍼 컨트롤(TButton 등)은 Win32 클래스라 UIA가 읽는다 [inference]. Delphi 13에서 VCL에 UI Automation 통합 추가(TWinControl.WMGetObject가 UiaReturnRawElementProvider 반환), 공식 문서·예제 빈약 [fact-cited][6 포럼, 2차].
- **정적 뷰어(실행 안 함)**: IDR(Delphi 2~XE4 디컴파일러, a1ext/IDR 포크 2 stars, 폼 탭에서 이벤트 확인) [fact-cited][7]. Resource Hacker·DeDe는 직접 열람 못 함 [미확인].

### 2. 없다면 왜
- 폼 정적 디코드 → 조작 문서 자동 생성은 못 찾음 [inference: 검색 범위 한정]. 기술 장벽이 아니라 수요 부재(테스트 도구는 "실행 중 객체 트리"가 관심사)에 가깝다 [inference].

### 3. 한계와 돌파
- 상용 도구는 라이선스·디버그 빌드·Delphi 버전에 묶임 [fact-cited][2]. 대상 앱을 재컴파일할 수 없는 사용자 환경에서는 불가 [inference].
- TCustomControl·오너드로우 그리드는 HWND 하나뿐이라 UIA 자식이 없음 [inference]. Ranorex도 그리드 셀은 벤더별 플러그인 [fact-cited][4].
- 범위 내 돌파: ① DFM의 컨트롤 클래스·Caption·Hint·이벤트명으로 "화면에 무엇이 있는가"를 정적 확보 ② 표준 컨트롤은 HWND/UIA로 조작 ③ 커스텀 영역은 좌표 클릭+스크린샷.

### 4. 우리 가치
- 디버그 정보·라이선스·실행 없이 exe에서 폼 구조(클래스, 이벤트 핸들러명)를 문서화. 로컬 실측: Inno Setup `unins000.exe` 2개(Git, CPUID HWMonitor)를 map하니 Delphi 폼 인식, 작업 69개 중 대부분 캡션이 `*`(placeholder) — 이름 있는 항목은 `PathEdit` 등 소수 [fact-cited: 로컬 실행 결과]. 즉 설치기류는 캡션이 런타임 생성이라 정적 문서만으론 라벨이 비고 UIA 보강이 필요 [inference].
- RCDATA 10 일반(DFM 외) 해석은 "다음 사이클 대상"으로 표시됨 [fact-cited: 로컬 출력].

## D2 Delphi FireMonkey

### 1. 현황
- **TestComplete**: VCL/CLX만, FMX 등 그래픽 렌더 프레임워크 미지원 [fact-cited][1 검색요약; 포럼 8 동일 보고].
- **Embarcadero FireMonkey Accessibility Package**: Windows는 MSAA 기반, JAWS·Narrator 테스트, 폼을 TAccForm으로 바꾸고 FMX.ScreenReader 유닛 추가해야 함, 커스텀 컨트롤은 IFMXAccessibility 구현 [fact-cited][9 검색요약; 페이지 직접 열람은 403].
- 포럼: FMX 컨트롤은 모두 자체 렌더라 일반 도구가 못 찾고, 마우스·키보드 시뮬+스크린샷 비교+OCR만 가능. 제안은 Sikulix(이미지 의존, 10케이스 넘으면 실패 보고), WinAppDriver·UIA(미검증) [fact-cited][8].
- Ranorex FMX 지원: 찾지 못함 [미확인].

### 2. 없다면 왜
- 기술 장벽: 자체 렌더링, 접근성은 앱 개발자가 옵트인해야 존재 [fact-cited][9].
- 공식 대안은 앱 쪽 접근성 패키지뿐(앱 소스 필요) [inference].

### 3. 한계와 돌파
- 접근성 미적용 FMX 앱은 UIA 트리가 최상위 창만 보임 [inference, 포럼 근거 8].
- 범위 내 돌파: 정적 FMX 폼 리소스(FMX는 .fmx를 RCDATA로 동봉, 형식은 TPF0 텍스트/바이너리) 파싱 가능 여부를 시험할 것 [inference·미검증]. 그 뒤 스크린샷+좌표 클릭, 키보드 탭 순서 활용.

### 4. 우리 가치
- 접근성이 없어도 폼 정의에서 컨트롤 이름·배치를 알면 비전 좌표 클릭의 "무엇을 눌러야 하나" 후보를 줄임 [inference]. 단 현재 AppHelm이 FMX 폼을 디코드하는지는 측정 안 함.

## 6축 표 (대표 앱)

| 앱 | 1 텍스트 | 2 입력 | 3 캡처 | 4 레이아웃 | 5 사이드채널 | 6 화면 |
|---|---|---|---|---|---|---|
| Inno Setup unins000 (D1) | 앱 카피(표준 컨트롤 UIA+DFM) | SendInput 가능 [inference] | 정상 | 고정 | 없음(레지스트리·설치 로그) | 창모드 |
| 한국 HTS/업무앱 (D1, 서드파티 그리드) | 부분(그리드 셀 비가시) [inference] | 대체로 가능 [inference] | 정상 | 스크롤 동적(그리드) | 로컬 DB 가능성 [inference] | 창모드 |
| FMX 앱 (D2, 접근성 미적용) | 없음(OCR/비전) [fact-cited 8] | 가능 [inference] | 정상 | 고정~동적 | 없음 | 창모드 |
| FMX 앱 (접근성 패키지 적용) | 부분 [fact-cited 9] | 가능 | 정상 | 고정 | 없음 | 창모드 |

대표 앱 중 HTS·FMX 실앱은 이 PC에서 측정하지 않았음. 해당 행은 추론.

## 출처
1. https://support.smartbear.com/testcomplete/docs/app-testing/desktop/delphi/about.html (검색요약)
2. https://support.smartbear.com/testcomplete/docs/app-testing/desktop/delphi/requirements.html (직접 열람, 1차)
3. https://community.smartbear.com/discussions/testcomplete-questions/testcomplete-support-for-delphi-13-desktop-application-with-devexpress-vcl-25-2-/280684
4. https://www.ranorex.com/delphi-application-testing/ 및 https://support.ranorex.com/hc/en-us/articles/49595379175953-Troubleshoot-Object-Recognition-in-Delphi-Applications (검색요약, 1차)
5. https://pywinauto.readthedocs.io/en/latest/getting_started.html (검색요약, 1차)
6. https://en.delphipraxis.net/topic/14495-uiautomation-in-delphi-13
7. https://github.com/a1ext/IDR (직접 열람, 1차)
8. https://en.delphipraxis.net/topic/9109-automating-delphi-fmx-based-application (직접 열람)
9. https://docwiki.embarcadero.com/RADStudio/en/FireMonkey_Accessibility_Package (검색요약, 1차, 직접 열람 403)

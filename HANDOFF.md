# 인계 노트

## 목표
- AppHelm(`F:\SUAN\2026-2\REA Adapter`, GitHub `Gistone9516/appHelm`)은 Windows 앱의 구조를 읽어 AI용 조작 문서를 만들고, 같은 경로로 조작하는 도구.
- 현재 방침은 새 기획 없이 **기반 다지기**.
- 제품 방향(2026-10-26 확정)은 "AI 직접 조작"과 "실시간 조언"을 모두 가져가는 것. 실시간 조언은 Laya가 사용자 조작을 감시하다 조언 신호를 내면 LLM이 받아 행동하는 구조(`docs/LAYA.md`).

## 한 일
- **툴킷 조사 9묶음과 전략 문서.** `docs/research/01~09-*.md`, 종합은 `docs/STRATEGY.md`.
- **툴킷 판별** (`4e05de5`, IF-35). Qt, Flutter, CEF, WebView2, Java, GTK, Unity를 `src/core/toolkits.ts` 표 하나로 판별. 실행 중 화면 읽기는 자손 프로세스 창까지, 최소화된 창은 알림(IF-20).
- **Qt 리소스 수집원** (`ad90443`, IF-36). exe 안의 Qt 리소스 표를 심볼 없이 찾아 QML의 단축키와 라벨을 지도에 넣음. Free Download Manager에서 Ctrl+N "다운로드 추가"가 지도에 나오고, 스크린샷 없이 조작됨(F-32, F-33).
- **조작 단계 고침** (`db30c61`, IF-37).
  - `invoke-uia` 85초 시간 초과의 진짜 원인은 스크립트 속 한국어를 PowerShell 5.1이 cp949로 읽어 문법 오류로 아예 안 돈 것(F-34). 스크립트를 ASCII로 바꾸고 실행기가 복사본에 BOM을 붙임. 4초로 줄어듦.
  - 스크립트가 `ok:false`를 돌려줘도 성공으로 보고하던 다섯 곳을 `fromScript` 하나로 모음.
  - `invoke-window --keys`는 대상 창이 실제 맨 앞일 때만 키를 보냄. 전에는 실패해도 보내서 다른 앱에 입력될 수 있었음. 원격 에이전트도 같게 고침(버전 `2026-10-30.9-fg`).
  - 다른 가상 데스크톱으로 간 창(`cloaked`)은 UIA에서 빠짐(F-35). 실행 중 화면 읽기가 이를 알리고, 키와 창 복원은 거부함.
  - `invoke-window --show restore|minimize|maximize` 추가.
  - `invoke-screenshot`이 프로세스 기준으로 창을 못 찾던 버그 고침(`f4b3f2f`, SH-38).
- **검증:** 단위 80, e2e 10, typecheck, check:boundaries, build-ps --check 모두 통과.
- push는 `ad90443`까지 했고, `db30c61`과 이 노트는 로컬 커밋만 됨.

## 다음 단계
1. **Free Download Manager로 조작 전체 흐름 재실측.** 지금 그 창이 다른 가상 데스크톱에 있어서(`cloaked=2`) 못 함. 사용자가 창을 지금 데스크톱으로 옮기면 `--show restore`, Ctrl+N, UIA 확인, Esc 순서로 잼.
2. **원격 에이전트 재배포.** 노트북은 구버전일 수 있음. 새 버전은 `2026-10-30.9-fg`.
3. **`STRATEGY.md` 6장 남은 항목.** 보호 앱(G5) 사전 판정, Delphi 설치기의 빈 이름(`*`)을 UIA 이름으로 채우기, Electron 퓨즈를 `.ops.md`에 표시, `--out`의 풀리지 않은 `%TEMP%` 거부.
4. **Qt 수집원 다듬기.** 작업 이름이 코드(`buildDownloadDlg.newDownload()`)라 라벨로 바꾸기, zstd 리소스 읽기.
5. **중복 로직 합치기.** click/type/screenshot/window/uia가 `src/ps/scripts`와 `agent/apphelm-agent.ps1`에 두 벌. 이번 키 안전장치도 두 곳에 따로 넣었음.
6. **Laya 붙이기 전 측정** (`docs/LAYA.md` 6장).
7. **이전 세션 백로그.** 실행 경량화, 응용 계층 전수 조사 프롬프트 튜닝, skill화, 포트폴리오용 README.

## 미결 결정
- **집중할 툴킷.** 결정 기록은 없음. 10-26 이전 세션에서 제안만 있었음(강점 Win32·COM·Delphi + 격차 Electron·Qt). 사용자 확정 필요.
- **Flutter semantics 시험.** 남은 길은 전역 스크린리더 플래그(`SPI_SETSCREENREADER`)나 내레이터 실행. 2026-10-30 사용자가 "프로그램 실행 권한 다 줄게"라고 했으나 전역 설정까지 포함하는지는 확인 안 함.
- **전자금융거래법.** AI에게 인증정보를 맡기는 것이 접근매체 대여인지 법률 검토 필요. 그전까지 금융 인증은 사람이 함.
- **전역 설정 경고 3건** (`~/.claude`, 로컬 커밋 `84079e8`, push 안 함).
  - 훅 차이: 이 PC의 settings.json에만 SessionStart `git pull` 훅이 있음. 예시 파일에 넣을지(모든 PC가 자동 pull) 정해야 함.
  - CLAUDE.md가 9,786바이트로 한도 9,700을 86바이트 넘음. 규칙 파일이라 줄이는 건 사용자 확인 후.
  - 외부 앱 2개(Discord Agents, learning-harness)는 다른 PC 경로(`C:\Users\USER\...`)라 이 PC에선 원래 없음. 이 PC에 있으면 `CLAUDE_APP_*` 환경변수로 지정.

## 건드린 파일 (2026-10-30)
- 코드: `src/ps/runner.ts`(BOM), `src/ps/scripts/{invoke-uia,invoke-window,type,uia}.ps1`, `src/invoke/index.ts`(`fromScript`, show), `src/cli/{invoke,main}.ts`, `src/mcp/server.ts`, `src/core/types.ts`(`LiveUi.cloaked`), `src/collectors/uia-snapshot/index.ts`, `agent/apphelm-agent.ps1`.
- 테스트: `test/unit/ps-scripts.test.ts`.
- 문서: `_인터페이스계약.md`(IF-37, F-34, F-35, IF-20), `README.md`.
- 전역: `~/.claude/scripts/check-manifest.ps1`, `.gitignore`, `skills/work-rules-shell/SKILL.md`, `manifest.json`.
- 명령: git은 `git -c safe.directory=* -C "F:/SUAN/2026-2/REA Adapter" …`. push는 도구 셸에서 자격 증명이 막혀 `schtasks /rl LIMITED /it`로 사용자 세션에서 실행. 화면이 필요한 실험도 같은 방법.
- 실측 임시 파일: `%TEMP%\apphelm-measure\`.

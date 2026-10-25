# 인계 노트

## 목표
- AppHelm을 원격 기능 없이도 다른 Windows PC에 금방 설치해 바로 쓸 수 있게 만들기.
  - 사용자 결정: "원격 말고는 다른 컴퓨터에서 금방 설치 가능해야 해. 원격은 내 세팅일 뿐" (2026-10-25)
- 백로그 6건 중 1번 "로컬 의존성 없애기"에 해당. 2번 "실행 경량화"도 일부 겹침.

## 한 일
- **일반 exe 분석에서 REA 의존 제거.** PE 리소스 디렉터리(형식→이름→언어 3단계)를 직접 읽는 `src/pe/resources.ts`를 새로 만듦.
  - 바꾸기 전에 REA `inspect-pe-resources`와 8개 파일에서 비교함. 대상은 notepad·regedit(exe+.mui), mspaint, explorer, shell32, SampleApp.
  - 위치·크기·순서까지 완전히 같았음. explorer는 683건, 그중 이름 항목 427건 포함.
  - 확인 후 REA 경로 `src/rea-bridge/peResources.ts`는 삭제함. 같은 일을 두 곳에서 하지 않기 위해서임.
- **REA는 .NET 폼, Electron fuse, Ghidra 추적에만 남음.** 이 대상들은 첫 실행에 REA를 내려받아 1분쯤 걸림.
- **버그 수정.** Git Bash에서 `apphelm map notepad`가 `C:\Program Files\Git\usr\bin\notepad`(셸 스크립트)를 골라 실패하던 문제.
  - `src/probe/index.ts`의 탐색 순서를 바꿔 이름 후보(.exe 먼저)를 바깥 고리로 둠. 계약서 IF-25로 기록.
- **패키징.** `package.json`에 `files` 필드 추가(bin, src, agent, README.md).
  - README의 설치와 MCP 등록 안내에서 절대경로를 없앰.
- **검증 결과**
  - 단위 51, e2e 10 통과. typecheck와 check:boundaries도 통과.
  - npx가 없는 PATH에서 notepad 지도 생성 4.6초(메뉴 5, 작업 38).
  - `npm pack`으로 만든 패키지(66KB)를 임시 prefix에 설치하는 데 4초. 설치본에서 `apphelm map`과 `apphelm-mcp` 응답(initialize, tools/list) 정상.
- **커밋.** 로컬 커밋 `bf88287` "리소스 읽기에서 REA 의존 제거, npm 한 줄 설치 정리". **아직 push 안 함.**

## 다음 단계
1. 사용자 승인을 받고 push. 이 PC는 자격 증명 문제로 사용자가 직접 실행해야 함.
   - `git -c safe.directory=* -C "F:\SUAN\2026-2\REA Adapter" push origin main`
2. push 후 실제 설치 확인: `npm install -g github:Gistone9516/appHelm`, 이어서 `apphelm map notepad`.
3. MCP 등록을 새 방식으로 바꿀지 결정. 지금 이 PC는 옛 방식(절대경로 + 옛 토큰)으로 등록돼 있음.
   - 새 방식: `claude mcp remove apphelm` 후 `claude mcp add apphelm -- cmd /c apphelm-mcp`
   - 원격을 쓰면 `-e APPHELM_TOKEN=<토큰>`을 이름 뒤, `--` 앞에 넣음.
4. 남은 백로그(`memory/next-steps.md`):
   - 2번 실행 경량화: .NET·Electron 대상의 REA 첫 다운로드를 줄이는 것이 남음.
   - 3번 프롬프트 튜닝, 4번 skill화, 5번 Git 꾸미기(readme-writing 스킬 사용).
   - 6번 "Laya 레이어"는 뜻부터 사용자에게 물어볼 것.

## 미결 결정
- push 여부. 외부 공개라서 승인이 필요함.
- 이 PC의 MCP 등록을 설치본(`cmd /c apphelm-mcp`)으로 바꿀지, 개발 폴더를 직접 가리키게 둘지.
- .NET·Electron 분석도 REA 없이 할지. .NET 메타데이터 리더는 작업량이 커서 보류 중임.
- Node 버전: `engines`는 `>=20`. REA 없는 경로는 Node 20에서 실측하지 않았음. 이 PC는 24.22.0.

## 건드린 파일
- 새로 만듦
  - `src/pe/resources.ts`
  - `test/unit/pe-resources.test.ts`
  - `test/unit/probe.test.ts`
- 삭제: `src/rea-bridge/peResources.ts`
- 수정
  - `src/collectors/pe-resources/index.ts`, `src/collectors/delphi-dfm/index.ts`
  - `src/pe/pe.ts` (머리 주석만)
  - `src/probe/index.ts`
  - `test/e2e/windows-apps.test.ts` (주석·제목)
  - `package.json`
  - `README.md`, `HANDOFF.md`
  - `_인터페이스계약.md`: IF-6·IF-8·IF-12 개정, IF-25와 F-24 추가, §4 폴더 지도
- 메모리: `C:\Users\ckffl\.claude\projects\F--SUAN-2026-2-REA-Adapter\memory\next-steps.md` (1번 완료 표시)
- 이번 작업과 무관한 미해결 사항: 세션 시작 점검에서 `~/.claude` 설정 불일치 4건이 보고됨. 사용자에게 알렸고 아직 처리하지 않음.
  - 훅 불일치
  - `skills\synced` 미등록
  - CLAUDE.md 크기 초과
  - 외부 앱 경로 2개

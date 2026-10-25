# 인계 노트

## 목표
MCP를 지원하지 않는 Windows 프로그램을 AI가 하네스로 조작할 수 있게 하는 도구 **REA Adapter**를 만든다.
- 하는 일: 프로그램의 리소스·코드·Windows 창구를 읽어 **AI가 읽는 조작 문서**(Markdown 요약 + JSON)를 만든다.
- 조건: 사전 작업 없이 명령 한 줄로 실행. 깊은 역공학은 하지 않는다.
- REA(morluto/rea, MIT)는 포크하지 않고 **하위 엔진으로 불러 쓴다**. 사용자가 고른 "얇은 새 패키지" 방식이다.
- 사용자는 코드를 거의 쓰지 않으므로 AI가 구현하고, 사용자는 `map` 명령만 실행한다.

## 한 일
- **0차 실측** (공유 계약 F-1~F-8에 기록)
  - REA 6.7.0은 Node 24.22.0에서도 돈다. 첫 실행 75초, 이후 약 4초.
  - REA CLI에는 `inspect-pe-imports`가 없다. 그래서 import는 어댑터가 직접 읽는다.
  - TypeLib은 PowerShell 5.1에서 설치 없이 읽힌다.
  - 이 셸은 Session 0이라 UIA 창이 0개였다. 예약 작업(`schtasks /rl LIMITED /it`)으로 띄우면 Session 1에서 창 9개가 보인다.
- **1차 사이클 완료**, 커밋 `c2060cc` (로컬만, push 안 함)
  - 리소스 위치는 REA `inspect-pe-resources`로 얻고, 메뉴·단축키·문자열·버전·대화상자는 직접 해석한다.
  - MUI 파일(`ko-KR\*.mui`)을 따라간다.
  - 메뉴와 단축키를 명령 ID로 합친다.
  - IF-15: 특수 모드용 단축키 표를 분리한다. 메모장 SLIPUPACC가 Ctrl+C를 "끝내기"에 연결하고 있었다.
  - IF-16: 이름 없는 명령은 MFC 표준 ID 표로 이름을 붙인다.
- **검증**: 단위 테스트 18개, e2e 5개(메모장·레지스트리 편집기·그림판), 타입 검사, 경계 검사 모두 통과.
- **실행**: `node bin/rea-adapter.mjs map notepad` → `rea-adapter-out\notepad.ops.md`와 `.ops.json`. 대상 하나에 약 8초.

## 다음 단계
1. **2차 사이클**: 사용자에게 착수 여부를 확인하는 중이었다(마지막 질문에 아직 답 없음). 붙일 수집원은 아래와 같다.
   - `src/collectors/registry-verbs/`: 셸 동사, URL 프로토콜, 연결 프로그램
   - `com-typelib/`: CLSID → TypeLib 메서드. 참고: `%TEMP%\rea-c0\scripts\t2_typelib.ps1`
   - `local-ports/`
   - `src/session/` + `uia-snapshot/`: 예약 작업 방식이고 `--live` 옵트인. 작업은 끝나면 반드시 삭제한다(IF-14).
   - PowerShell 실행기 `src/ps/` (UTF-8, EncodedCommand)
2. **3차**: .NET(REA managed 명령), Delphi DFM(RCDATA), Electron(REA analyze-javascript-application), 폴더 대상
3. **4차**: MCP 서버(`map_program`, `get_operation_doc`)와 실행 계층(WM_COMMAND, COM, 단축키). 화면 조작은 Windows-MCP와 연동한다.
4. **사이클마다**: 공유 계약을 먼저 고치고 → 구현 → `npm run typecheck`, `check:boundaries`, `test`, `e2e` → README 갱신 → 로컬 커밋.

## 미결 결정
- 2차 착수 승인. 에이전트를 쓸 경우 대수를 먼저 보고한다. 지금까지 4대를 썼다.
- git 작성자(gistone9516 / ckfflem@gmail.com)를 전역 규칙에도 넣을지. 지금은 이 저장소와 프로젝트 메모리에만 있다.
- `.git` 소유자가 SYSTEM이라 git 명령마다 `-c safe.directory=*`를 붙이고 있다. 전역 설정으로 바꿀지.
- 이름 "REA" 사용 여부. 상표 등록 여부는 확인하지 못했다. 개인용이면 문제없다.
- 법적 범위는 "본인 소유이거나 허가받은 프로그램"으로 고지만 한다(저작권법 제101조의4). 근거는 검색 발췌라 약하다.

## 건드린 파일
- `F:\SUAN\2026-2\REA Adapter\`
  - `_인터페이스계약.md` (SoT. 규칙 IF-1~IF-16, 실측 F-1~F-8. 코드와 충돌하면 이 문서가 이긴다)
  - `README.md`, `package.json`, `tsconfig.json`, `.gitignore`, `bin/rea-adapter.mjs`
  - `src/{core,pe,decoders,rea-bridge,collectors/pe-resources,collectors/pe-imports,probe,merge,render,cli}/`
  - `scripts/check-boundaries.ts`, `test/unit/*`, `test/e2e/windows-apps.test.ts`
- 계획: `C:\Users\ckffl\.claude\plans\structured-dazzling-shannon.md`
- 메모리: `C:\Users\ckffl\.claude\projects\F--SUAN-2026-2-REA-Adapter\memory\git-identity.md`, `MEMORY.md`
- 임시 파일 (지워도 됨): `%TEMP%\rea-brief\rea` (REA 소스 사본, 실행한 적 없음), `%TEMP%\rea-c0\` (점검 스크립트와 출력)

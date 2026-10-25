# 인계 노트

## 목표
- **AppHelm**(구 REA Adapter): MCP를 지원하지 않는 Windows 프로그램을 LLM이 조작하게 하는 도구.
  - 저장소: github.com/Gistone9516/appHelm (`main`)
  - 로컬: `F:\SUAN\2026-2\REA Adapter`. git, 메모리 키, MCP 경로가 깨지지 않게 폴더 이름은 그대로 뒀다.
- 하는 일은 두 가지다.
  - exe의 리소스, COM, 셸 동사, UI, 폼을 읽어 AI용 조작 문서를 만든다(`*.ops.md` 4KB 요약 + `*.ops.json`).
  - 그 문서대로 COM·창·UIA·HTTP로 실제 조작한다. Tailscale로 연결된 PC도 대상이다.
- REA(`rea-agents@6.7.0`)는 포크하지 않고 하위 엔진으로만 호출한다. 가볍게 유지하고 코드 복사를 피하려는 사용자 결정이다.

## 한 일
- **1~5차와 MCP 서버 완료, push까지 끝.** GitHub이 만든 초기 커밋은 force push로 덮었다.
  - 커밋: 1차 `c2060cc`, 2차 `be360c3`, 3차 `3b03f10`, MCP `93524bd`, 5차 `18607dd`, 리네임 `9552a58`
- **원격 실증(2026-10-25).** 노트북 `book-akvd4hpqjf`(100.67.200.125)의 Word에서 확인했다.
  - UIA로 "편집 사용(E)"을 클릭했다.
  - COM으로 `테스트 성공 안녕 준서`를 입력하고 `ActiveDocument.Content.Text`로 되읽었다.
- **MCP 서버(`src/mcp/`).** 의존성 없는 stdio JSON-RPC로 직접 구현했다.
  - 도구: `list_hosts`, `map_program`, `get_operation_doc`, `invoke_operation`, `trace_native`
  - Claude Code에 `apphelm`으로 등록돼 있다(Connected).
  - `shell` 조작은 임의 명령 실행 위험 때문에 노출하지 않았다.
- **5차 Ghidra 추적.** Ghidra 12.1.4와 Temurin JDK 21을 `C:\tools`에 설치했다(sha256 대조 완료).
  - REA가 검증한 조합이라 최신 12.2(JDK 25 필요) 대신 골랐다.
  - 메모장 결과: 함수 794개, 문자열 557개, 콜드 스타트 약 180초, `--query entry` 매치 2건.
- **실패 원인 기록.**
  - `_인터페이스계약.md` F-16~F-23과 §5 배포 체크리스트
  - 전역 `work-rules-shell` SH-35~37
  - 메모리 `remote-operation-gotchas.md`
- **검증.** 단위 테스트 46개, e2e 10개 통과.

## 다음 단계
- **사용자 백로그는 아직 착수하지 않았다**(메모리 `next-steps.md`). 1번과 6번은 뜻이 불분명하니 먼저 사용자에게 물어본다.
  1. 로컬 의존성 없애기
  2. 실행 경량화
  3. 응용 계층을 빠짐없이 조사하도록 프롬프트 튜닝
  4. skill화
  5. Git 저장소 꾸미기(`readme-writing` 스킬)
  6. "Laya 레이어" 적용 방안
- **정리할 것.**
  - `HANDOFF.md`의 다음 단계가 옛 내용이라 현재 상태로 고친다.
  - `agent/apphelm-agent.ps1` 런스페이스 블록의 `Invoke-Com`은 죽은 코드다. COM은 이제 `Invoke-ComMain`이 처리한다.
  - `invoke-uia`는 .53에서 실증하지 못했고 노트북에서만 확인했다(F-21).
- **검증 명령.** `npm run typecheck`, `npm run check:boundaries`, `npm test`, `npm run e2e`
- **로컬 실행.**
  - 조작 문서: `node bin/apphelm.mjs map notepad`
  - Ghidra 추적: `node bin/apphelm.mjs trace "<exe>" --query <함수>`
- **원격 실행.**
  - 대상 PC에서 **일반 권한** PowerShell로 실행한다: `powershell -ExecutionPolicy Bypass -File agent\apphelm-agent.ps1 -Token <토큰>`
  - 조작하는 쪽에서 실행한다: `$env:APPHELM_TOKEN="<토큰>"; node bin/apphelm.mjs invoke-com --progid Word.Application --attach --path ActiveDocument.Name --host 100.67.200.125`

## 미결 결정
- **대상을 실행하는 수집**(`--allow-launch`, cli-help)은 사용자 화면에 창이 떠서 보류했다.
- **`~/.claude` 변경이 커밋되지 않았다.** SH-35~37과 `manifest.json`이다. 공개 저장소라 따로 판단해야 한다.
- **토큰 정리.**
  - MCP 등록 env에 옛 시험 토큰이 아직 들어 있다.
  - 노트북에 47817 포트 urlacl이 등록된 채로 남아 있다.
- **세션 시작 때 보고한 설정 불일치가 그대로다.** hook 예시 파일, `skills\synced` 미등록, CLAUDE.md, 외부 앱 경로.
- **알려진 한계.**
  - PowerShell 에이전트에는 `/map`이 없다. 원격 map은 Node `serve` 에이전트에서만 된다.
  - .NET 폼 글자 추정의 신뢰도는 0.5이고, WPF는 해석하지 않는다.
  - Windows용 Ghidra는 실험 단계이고 네이티브 PE만 다룬다.

## 건드린 파일
- 문서: `_인터페이스계약.md`(IF-1~25, F-1~24, §4·§5), `README.md`, `HANDOFF.md`
- 코어·수집: `src/{core,pe,probe,merge,render,decoders}/`, `src/collectors/*/index.ts`(9개), `src/cli/collectors.ts`
- 실행·전송·MCP:
  - `src/invoke/`, `src/server/agent.ts`, `src/transport/{host,client}.ts`(client는 cli에서 옮겼다)
  - `src/mcp/{jsonrpc,server,main}.ts`, `src/trace/index.ts`
  - `src/pe/{pe,resources,mui}.ts`, `src/rea-bridge/{runner,ghidra}.ts`, `src/ps/`, `src/session/`
- 진입점: `bin/apphelm.mjs`, `bin/apphelm-mcp.mjs`, `agent/apphelm-agent.ps1`(버전 `2026-10-25.5-com`)
- 테스트: `test/unit/*.test.ts`, `test/e2e/windows-apps.test.ts`
- 외부:
  - `~/.claude/skills/work-rules-shell/SKILL.md`, `~/.claude/manifest.json`, `~/.claude.json`(MCP 등록)
  - 메모리 3건: `git-identity.md`, `remote-operation-gotchas.md`, `next-steps.md`
  - `C:\tools\ghidra_12.1.4_PUBLIC`, `C:\tools\jdk-21`
- 임시 폴더:
  - `%TEMP%\rea-c0`: 시험 스크립트
  - `%TEMP%\rea-brief\rea`: REA 클론. 신뢰하지 않는 파일이라 실행하지 않았다.
  - `%TEMP%\rea-dl`: 다운로드 파일

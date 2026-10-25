# 인계 노트

## 목표
- MCP를 지원하지 않는 Windows 프로그램을 AI가 조작하게 하는 도구 **REA Adapter**를 만든다. 위치는 `F:\SUAN\2026-2\REA Adapter`.
- 하는 일은 두 가지다.
  - 대상 exe의 리소스·COM·셸 동사·UI를 읽어 **AI용 조작 문서**(`*.ops.md` 4KB 요약 + `*.ops.json`)를 만든다.
  - 그 문서대로 **실제로 조작**한다. Tailscale로 연결된 다른 PC도 대상이다.
- REA(`rea-agents@6.7.0`)는 포크하지 않고 하위 엔진으로 불러 쓴다. 사용자 결정이며, 가볍게 유지하고 코드 복사를 피하려는 이유다.

## 한 일
- **1~3차 완료.** 커밋은 `c2060cc`, `be360c3`, `3b03f10`이다.
  - 네이티브 exe: 메뉴·단축키·대화상자·버전, import 기반 기능 추정.
  - COM TypeLib·셸 동사·포트·UIA.
  - .NET WinForms·Delphi DFM·Electron.
- **4차(MCP 서버 제외) 완료.** 마지막 커밋은 `0f18c0c`이고, **push는 안 했다.**
  - 실행 계층 `src/invoke/`: com·window·uia·http·shell.
  - `serve`/`--host` 전송, 무설치 에이전트 `agent/rea-agent.ps1`.
- **원격 실증(2026-10-25).** 노트북 `book-akvd4hpqjf`(100.67.200.125)의 Word에서 확인했다.
  - UIA로 "편집 사용(E)"을 클릭했다.
  - COM으로 `테스트 성공 안녕 준서`를 입력하고 `ActiveDocument.Content.Text`로 되읽어 확인했다.
- **실패 원인 기록.**
  - `_인터페이스계약.md` F-16~F-22와 §5 배포 체크리스트.
  - 전역 `work-rules-shell` SH-35~37.
  - 프로젝트 메모리 `remote-operation-gotchas.md`.
- **검증 상태.** 단위 테스트 40개, e2e 10개 통과. 이후 TS 코드는 바뀌지 않았다.

## 다음 단계
1. **MCP 서버(`src/mcp/`)를 만든다.**
   - 도구: `list_hosts`, `map_program(host,target)`, `get_operation_doc(host,section,query)`, `invoke_operation(host,action)`.
   - stdio 방식이며 `@modelcontextprotocol/sdk` 사용을 검토한다.
2. **에이전트의 죽은 코드를 정리한다.** `rea-agent.ps1` 런스페이스 블록 안의 `Invoke-Com`은 이제 안 쓴다. COM은 `Invoke-ComMain`이 메인 스레드에서 처리한다.
3. **`invoke-uia` 단위·e2e 테스트를 보강한다.** .53에서는 실증하지 못했다(세션 0 브리지 한계, F-21). 실증은 노트북에서만 했다.
4. **검증 명령.** `npm run typecheck`, `npm run check:boundaries`, `npm test`, `npm run e2e`.
5. **원격 재현 순서.**
   - 대상 PC에서는 **일반 권한** PowerShell로 실행한다: `powershell -ExecutionPolicy Bypass -File agent\rea-agent.ps1 -Token <토큰>`
   - 조작하는 쪽에서는 `$env:REA_ADAPTER_TOKEN="<토큰>"`를 설정한 뒤 실행한다: `node bin/rea-adapter.mjs invoke-com --progid Word.Application --attach --path ActiveDocument.Name --host 100.67.200.125`

## 미결 결정
- **대상을 실행하는 수집**(`--allow-launch`, `cli-help`)은 사용자 화면에 창이 떠서 보류했다. 넣을지 정해야 한다.
- **push 여부.**
  - 프로젝트 저장소.
  - `~/.claude` 저장소: `skills/work-rules-shell/SKILL.md`와 `manifest.json`이 수정됐지만 커밋하지 않았다. 공개 저장소다.
- **시험 토큰 `rea9f3c71e2b8`은 폐기하거나 교체해야 한다.** 노트북에는 urlacl(127.0.0.1와 100.67.200.125의 47817 포트)이 등록된 채로 남아 있다.
- **세션 시작 때 보고한 설정 불일치가 아직 그대로다.**
  - hook 예시 파일 불일치.
  - `skills\synced` 미등록.
  - CLAUDE.md 용량 초과.
  - discordAgents·learningHarness 경로.
- **알려진 한계.**
  - .NET 폼 글자 추정은 신뢰도 0.5다.
  - WPF는 해석하지 않는다.
  - Node v24.22.0은 REA 요구 버전보다 낮지만 동작한다(F-1).

## 건드린 파일
- 계약·문서: `_인터페이스계약.md`(IF-1~24, F-1~22, §5), `README.md`.
- 코어: `src/core/{types,policy,pipeline}.ts`, `src/pe/{pe,mui}.ts`, `src/probe/index.ts`, `src/merge/{index,knownIds}.ts`, `src/render/markdown.ts`.
- 해석기: `src/decoders/{reader,menu,accelerator,stringtable,versioninfo,dialog,dfm,asar}.ts`.
- 수집원: `src/collectors/{pe-resources,pe-imports,registry-verbs,com-typelib,local-ports,uia-snapshot,dotnet,delphi-dfm,electron-js}/index.ts`.
- 실행·전송: `src/invoke/index.ts`, `src/server/agent.ts`, `src/transport/host.ts`, `src/cli/{main,invoke,serve,client}.ts`, `src/rea-bridge/{runner,peResources}.ts`, `src/ps/runner.ts`, `src/session/index.ts`.
- PowerShell: `src/ps/scripts/{com,verbs,ports,uia,invoke-com,invoke-window,invoke-uia}.ps1`, `agent/rea-agent.ps1`(버전 `2026-10-25.5-com`).
- 테스트·도구: `test/unit/*.test.ts`, `test/e2e/windows-apps.test.ts`, `test/fixtures/dotnet-winforms/SampleApp.cs`, `scripts/{check-boundaries.ts,build-fixtures.ps1}`.
- 전역: `~/.claude/skills/work-rules-shell/SKILL.md`, `~/.claude/manifest.json`, 프로젝트 메모리 `memory/{git-identity,remote-operation-gotchas}.md`. git 전역 작성자는 gistone9516 / ckfflem@gmail.com이다.
- 임시 폴더.
  - `%TEMP%\rea-c0`: 시험 스크립트.
  - `%TEMP%\rea-brief\rea`: REA 클론. 신뢰하지 않는 파일이라 실행하지 않았다.
  - `%TEMP%\rea-adapter`: 옛 작업 폴더 72개. 권한이 막혀 지우지 못했다.

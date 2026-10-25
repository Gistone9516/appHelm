# REA Adapter

MCP를 지원하지 않는 Windows 프로그램을 AI가 조작할 수 있도록, 프로그램의 리소스와 Windows가 드러내는 창구를 읽어 **AI가 읽는 조작 문서**를 만드는 도구. 정보 수집의 일부는 [REA](https://github.com/morluto/rea)(MIT)를 하위 엔진으로 불러 쓴다. 깊은 역공학은 하지 않는다.

## 실행

Node.js 20 이상이 필요하다. 처음 한 번 의존성을 설치한다.

```
npm install
```

그다음 명령 한 줄로 문서를 만든다.

```
node bin/rea-adapter.mjs map notepad
node bin/rea-adapter.mjs map "C:\Program Files\앱\app.exe" --out 결과폴더
```

- Markdown 요약(4KB 이하)이 화면에 출력되고, `rea-adapter-out\<이름>.ops.md`와 전체 내용 `<이름>.ops.json`이 저장된다.
- REA 첫 실행은 패키지 다운로드 때문에 1분 정도 걸리고, 이후에는 대상 하나에 약 8초가 걸린다.
- 본인이 소유하거나 분석을 허가받은 프로그램에만 쓴다(저작권법 제101조의4).

검증 명령:

```
npm run typecheck
npm run check:boundaries
npm test
npm run e2e
```

## 구조

```
_인터페이스계약.md     공유 계약 (규칙 IF-1~IF-16, 실측 사실 F-1~F-8). 코드와 충돌하면 이 문서가 이긴다
bin/rea-adapter.mjs    실행 진입점 (tsx로 소스를 바로 실행)
src/core/              공유 타입, 부작용 허용 판정(IF-2), 파이프라인
src/pe/                PE 헤더·import 표 읽기, MUI 파일 탐색
src/decoders/          메뉴·단축키·문자열·버전·대화상자 리소스 바이트 해석
src/rea-bridge/        REA CLI 실행(버전 6.7.0 고정)과 출력 해석
src/collectors/        수집원. pe-resources(리소스), pe-imports(import 기반 기능 추정)
src/probe/             대상 판별 (경로나 이름 → 실행 파일, 종류, MUI)
src/merge/             수집 결과 → 조작 문서 (같은 명령 합치기, 이름 결정)
src/render/            Markdown 요약
src/cli/               rea-adapter map 명령
scripts/check-boundaries.ts   폴더 간 import 규칙 검사 (IF-3)
test/unit/, test/e2e/         단위 테스트, 실제 Windows 앱 테스트
```

## 설계 핵심

- **REA는 리소스 위치만 찾고, 해석은 어댑터가 한다 (IF-6).** REA CLI는 리소스 내용을 해석하지 않고, import 명령도 없다(F-3, F-4). 같은 일을 두 곳에서 구현하지 않으려고 PE 리소스 디렉터리는 REA만 읽는다.
- **MUI 파일을 따라간다 (IF-7).** Windows 기본 앱의 메뉴는 `ko-KR\notepad.exe.mui` 같은 별도 파일에 있다. 이걸 안 보면 메뉴가 통째로 빠진다.
- **같은 명령은 하나의 작업으로 합친다 (IF-10, IF-15).** 메뉴 항목과 단축키를 명령 ID로 묶는다. 단축키 표끼리 같은 키를 다른 명령에 연결하면, 소수 쪽 표를 특정 모드용으로 분류해 기본 단축키에서 뺀다. 메모장의 SLIPUPACC 표가 Ctrl+C를 "끝내기"에 연결하고 있어서 생긴 규칙이다.
- **수집원은 실패해도 예외를 던지지 않는다 (IF-1).** 일부가 실패해도 나머지 결과로 문서를 만들고, 실패는 "한계"에 적는다.
- **대상 프로그램을 실행하거나 붙는 수집은 플래그가 있어야 한다 (IF-2).** 판정은 `src/core/policy.ts` 한 곳에서만 한다.

## 현재 상태

- 1차 사이클 완료: 네이티브 exe의 메뉴, 단축키, 대화상자, 버전, import 기반 기능을 문서로 만든다. 메모장, 레지스트리 편집기, 그림판으로 검증했다.
- 다음 사이클:
  - 2차: 셸 동사·URL 프로토콜, COM TypeLib, 로컬 포트, 사용자 세션의 UIA 수집
  - 3차: .NET, Delphi 폼, Electron
  - 4차: MCP 서버와 실행 계층
- 알려진 제약: 이 도구를 서비스 세션(Session 0)에서 실행하면 화면 창이 보이지 않는다. 정적 분석은 영향이 없고, UIA 수집은 2차에서 예약 작업 방식으로 해결한다(F-7, IF-14).

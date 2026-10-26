# Laya와 AppHelm의 실시간 조언 구조

## 1. 역할 (사용자 결정, 2026-10-26)

> 사용자 조작 기반 실시간 데이터 파악은 Laya 가 모니터링 하다가 조언 신호가 오면 LLM이 캐치해서 활동하는 방식이야.

> Laya 는 제품 방향에서 응용할거임. AI가 직접 조작 및 실시간 조언. 응용할 수 있게끔 추후 구현.

흐름은 아래와 같다.

```
사용자가 앱을 조작
  다음  AppHelm 변화 피드 (UIA, COM 이벤트 구독 + 이전 상태와 비교 + 몰아치는 변화 묶기)
  다음  Laya가 상태를 보고 판정 (조언할 때인가, 무슨 조언인가, 얼마나 급한가)
  다음  신호가 오면 그때만 큰 LLM을 불러 조언 작성 또는 조작
```

큰 LLM을 매 변화마다 부르지 않고, 작은 로컬 모델이 "지금 끼어들 때인가"만 싸게 거르는 구조다.

## 2. Laya가 무엇인가

- 저장소 [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya). 스스로를 "Non-autoregressive System 1 decision engine"이라 소개한다. Apache-2.0, 확인 시점 v0.4.16. 가중치는 Hugging Face `convaiinnovations` 조직에 있다.
- **글을 만들지 않는다.** 상태(텍스트, dict, list)와 질문 묶음을 주면 한 번의 순전파로 답을 낸다.
- 질문 형식은 세 가지다.
  - `choice`는 요청마다 넘긴 선택지(`criteria`) 중 하나를 고른다.
  - `score`는 순서 있는 척도(긴급도 등) 위의 값을 낸다.
  - `noul`은 어떤 명제가 참일 확률을 낸다.
- 답마다 확률과 `confidence`가 붙고, `min_confidence`로 확신이 낮은 답을 걸러낼 수 있다.

| 체크포인트 | 바탕 모델 | 크기 | 문맥 | 용도 |
|---|---|---|---|---|
| `laya` | ModernBERT-large | 421M | 512 | 영어 |
| `laya-multilingual` | mmBERT-base | 322M | 1024 (최대 8192) | 100개 이상 언어 |
| `laya-typed-decisions` | ModernBERT-large | 421M | 1024 | 구조화된 판정 업무 |

- 속도는 T4 GPU에서 질문 하나에 약 33ms, 묶어서 돌리면 질문당 7.2ms라고 README가 밝힌다. CPU도 지원한다.
- 쓰는 방법은 Python 패키지(`pip install laya`), CLI, HTTP 서버(`laya-serve`), ONNX 내보내기, MCP 서버, 그리고 TS, Go, Rust, Java, .NET 포트가 있다.
- **Node에서 바로 쓰는 길**이 있다. [receptron/laya](https://github.com/receptron/laya)(`@receptron/laya`)가 ONNX Runtime으로 모델을 돌리므로 Python이 필요 없다. Node 20 이상이고, 가중치 약 1.7GB, 메모리 약 2GB가 든다. 질문 세 개짜리 호출이 Apple 실리콘 CPU에서 약 140ms다. AppHelm이 Node라 이 길이 가장 잘 맞는다.
- 다만 이 패키지의 기본 모델은 영어 체크포인트(`convaiinnovations/laya`)다. `repo`, `subfolder`(예시 값 `multilingual`), `modelDir` 옵션으로 다른 묶음을 고를 수 있다고 README가 밝히지만, multilingual 묶음이 실제로 올라와 있는지는 아직 확인하지 않았다. 없으면 README의 내보내기 스크립트로 직접 만든다.

```ts
const laya = await Laya.load();
const r = await laya.systemOne(state, questions);
// r.answers.<이름>.choice / .probabilities / .score / .noul
await laya.close();
```

## 3. README가 밝힌 한계와 우리 쪽 대응

| 한계 | 대응 |
|---|---|
| 영어 체크포인트는 비라틴 문자에서 틀리면서도 확신이 높다 (크메르어 정확도 0, 확신 0.952) | 한국어 상태에는 반드시 `laya-multilingual`을 쓴다 |
| 배포된 체크포인트는 확신이 과하고, multilingual은 보정값이 없다 | 임계값을 믿기 전에 우리 데이터로 보정한다 |
| 선택지가 많으면 정확도가 떨어진다 (선택지 58개에서 24개만 맞음) | 조언 판정은 선택지를 몇 개로 묶는다. 조작 쪽에서 1만 개 넘는 COM 멤버를 고르는 용도로는 쓰지 않는다 |
| 정확도를 올리는 주된 방법은 미세조정이다 (기본 0.362, 미세조정 0.766) | 처음에는 그대로 쓰고, 사용자가 조언을 받아들였는지 무시했는지를 쌓아 나중에 학습 자료로 쓰는 방안을 검토한다 |
| 기본 문맥 1024 토큰을 넘으면 잘린다 | 상태는 변화분 위주로 짧게 만든다 |

## 4. AppHelm에서 맡길 일

**실시간 조언 (주 용도).** 선택지가 적은 질문이라 Laya가 강한 자리다.

```
state     = 최근 변화 요약 (앱, 창, 바뀐 요소, 입력된 글 일부, 경과 시간)
questions = {
  should_advise: noul    "지금 조언하면 도움이 된다"
  advice_kind:   choice  {맞춤법, 서식, 다음 단계 안내, 실수 경고, 없음}
  urgency:       score   [낮음, 보통, 높음]
}
```

`should_advise`가 임계값을 넘을 때만 큰 LLM을 부른다.

**직접 조작 (보조 용도).** 2026-10-25 분석 결론이다.
- 실행 직전 안전 관문으로 쓴다. 되돌릴 수 없는 동작인지, 사용자 의도와 맞는지를 확률로 판정한다.
- 큰 분류만 하는 거친 길잡이로 쓴다. 파일, 서식, 표, 삽입 중 무엇인지만 고르고, 그 안은 검색으로 좁힌다.
- 메인 선택기로는 쓰지 않는다. 선택지가 너무 많고 앱마다 학습이 필요해 "사전 작업 없이 바로"라는 기획과 부딪힌다.
- 토큰 절감 효과는 많아야 10~20% 정도로 추정했고, 측정한 적은 없다.

## 5. 붙이기 전에 잴 것

1. `@receptron/laya`로 multilingual 묶음을 불러올 수 있는지, 그리고 이 PC(Windows CPU)에서 지연 시간과 메모리.
2. 한국어 상태 몇십 건을 손으로 만들어 `should_advise` 판정 정확도와 확신 보정 상태.
3. 변화 피드에서 몇 초 단위로 묶어야 Laya 호출 수가 감당되는지.

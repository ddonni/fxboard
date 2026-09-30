# 인수인계 문서 — Session A → Session B

과제 5(대화가 끊겨도 이어지는 프로젝트) 검증용 인수인계 문서입니다. **Session B는 이
문서와 저장소만 보고 작업을 이어가야 합니다** — 이 문서를 작성한 대화의 전문은 전달되지
않습니다.

## ① 목표

fx-board 사이트의 "오늘" 카드에 **최근 7일 추이 미니 차트(스파크라인)** 를 추가로
완성합니다. 고정 검사 10개는 저장소 루트의 `CHECKS.md`에 있습니다 — 그 문서의 검사
정의는 바꾸지 말고 그대로 실행해서 통과 여부만 채우세요.

## ② 현재 상태 (Session A가 끝낸 일)

- 기준 커밋: `d676673`("고정 검사 10개 + 공통 사용 상한 확정") 이후 상태에서 시작함
- `sparkline.js` (신규): 스파크라인의 순수 계산 로직 3개 함수
  - `computeTrendSeries(rows, maxPoints=7)` — 최근 N건 추리기 + min/max/trend 계산
  - `buildSparklinePath(series, {width, height, padding})` — SVG `<path d="...">` 문자열 생성
  - `buildAriaLabel(series, unitLabel)` — 스크린리더용 대체 텍스트 문자열 생성
  - Node(`require`)와 브라우저(`window.Sparkline`) 양쪽에서 쓸 수 있는 UMD 패턴, 외부
    라이브러리 없음
- `scripts/test_sparkline_logic.js` (신규): 위 함수들에 대한 Node 테스트 — CHECKS.md
  #1~#5를 그대로 구현. 지금 실행하면 5개 전부 PASS.
- **DOM에는 전혀 손대지 않았습니다.** `app.js`, `index.html`, `style.css`는 이 인계
  시점까지 한 글자도 바뀌지 않았습니다.

## ③ 남은 작업 (Session B가 할 일)

1. `app.js`에 `<script src="sparkline.js">`를 `index.html`에서 `app.js`보다 먼저 로드하도록
   추가하고, `renderTodayCard(state)` 안에서 `window.Sparkline.computeTrendSeries(state.daily_readings)`를
   호출해 결과를 `<svg>`로 그려 넣으세요. `buildSparklinePath()`로 만든 `d` 문자열을
   `<path>`에 쓰면 됩니다.
2. `<svg>` 또는 감싸는 요소에 `aria-label`을 `buildAriaLabel()` 결과로 채우세요
   (CHECKS.md #7).
3. `style.css`에 스파크라인 선 색상을 CSS 변수(`--accent` 등 기존 변수 재사용 권장)로
   지정해서 다크모드에서도 읽히게 하세요.
4. 기록이 0건/1건일 때도 에러 없이 자연스럽게 보이는지 확인하세요(빈 상태 문구 또는
   점 하나만 있는 경우의 표시).
5. CHECKS.md의 검사 #6, #7, #8을 실제로 실행하고(Playwright 권장 — 로컬
   `python3 -m http.server`로 띄운 뒤 스크린샷/DOM 확인, 기존 세션들이 쓰던 방식과 동일),
   결과를 CHECKS.md의 "검사 결과 기록 표" B열에 채우세요. #1~#5, #9, #10도 다시 한번
   실행해서(회귀 확인) 같은 표에 채우세요.
6. 완료되면 **정확히 1개 커밋**으로 묶어서 남기세요.

## ④ 고정 검사 10개 — 인계 시점 스냅샷

| # | 검사 | 인계 시점 결과 |
|---|---|---|
| 1 | 0건 예외 없음 | PASS |
| 2 | 1건 예외 없음 | PASS |
| 3 | 8건↑ → 최근 7건만 | PASS |
| 4 | 포인트 수 = 행 수 | PASS |
| 5 | 상승/하락/횡보 판정 | PASS |
| 6 | `#today-card` 안에 `<svg>` 존재 | **PENDING** (DOM 미통합) |
| 7 | aria-label에 최솟값·최댓값·추세 포함 | **PENDING** (DOM 미통합) |
| 8 | 기존 5개 섹션 회귀 없음 | **PENDING** (DOM 변경 자체가 없어 아직 확인 불필요하지만, B의 통합 후 반드시 재확인) |
| 9 | check_secrets.py 0건 | PASS (신규 파일 2개 포함해서 재확인함) |
| 10 | 외부 라이브러리 없음 | PASS (package.json 없음, CDN 참조 없음) |

## ⑤ 사용 상한 잔여량

공통 상한(세션당): 파일 8개 이하 / 커밋 1개 / 도구 호출 40회 이하 / 외부 네트워크 0회

- Session A 사용량: 신규 파일 3개(`sparkline.js`, `scripts/test_sparkline_logic.js`,
  이 `HANDOFF.md`) → **남은 파일 한도 5개**. 커밋은 이 인계 커밋 1개만 사용 예정
  (한도 소진, 본인 몫은 정확히 1개). 외부 네트워크 0회 사용.
- Session B에게 남은 예산: 파일 **5개 이하**, 커밋 **1개**, 도구 호출 **40회 이하**
  (A와 별개로 카운트), 외부 네트워크 **0회**.

## ⑥ 파일/경로 지도

```
fx-board/
├── CHECKS.md              # 고정 검사 10개 정의 — 여기 있는 정의를 그대로 실행만 할 것
├── HANDOFF.md              # 이 문서
├── sparkline.js             # (신규, Session A) 순수 계산 로직 — 아직 아무도 안 불러씀
├── index.html               # 아직 미변경 — Session B가 <script src="sparkline.js"> 추가할 곳
├── app.js                   # 아직 미변경 — renderTodayCard()에 통합할 곳
├── style.css                # 아직 미변경 — 스파크라인 색상 추가할 곳
├── scripts/
│   ├── test_sparkline_logic.js  # (신규, Session A) CHECKS.md #1~5 테스트
│   └── check_secrets.py         # 기존 — 회귀 확인용으로 다시 실행할 것
└── data/history.json         # 실제 데이터 5건(2026-09-17~09-21) — 렌더링 테스트에 그대로 쓰면 됨
```

## ⑦ 막힌 점 · 주의사항 · 설계 이유

- **왜 로직을 먼저 분리했는가**: DOM 통합까지 한 번에 하면 "인계"가 의미 없어지므로,
  일부러 순수 계산(테스트 가능·결정론적)과 DOM 렌더링(브라우저 필요·시각 확인 필요)을
  나눠서 후자를 온전히 남겨뒀습니다.
- **trend 판정 기준**: 값 변화가 ±0.005 미만이면 "flat"으로 봅니다(부동소수점 오차
  때문에 0 비교 대신 아주 작은 허용범위를 둠). 이 기준을 바꾸지 마세요 — CHECKS.md #5의
  세 케이스가 이 기준을 전제로 설계되어 있습니다.
- **데이터 정렬 주의**: `state.daily_readings`는 저장 시점에 이미 날짜순일 수도 있지만,
  `computeTrendSeries()`가 내부적으로 다시 정렬하므로 순서를 신경 쓰지 않고 그대로
  넘기면 됩니다.
- **기존 5개 섹션을 절대 건드리지 마세요** — 카드 1~5(과제 4)의 통과 기준이 이미
  README.md에 문서화되어 있고, 실제 배포 데이터(`data/history.json`)도 그 기준으로
  검증된 상태입니다. 스파크라인은 "오늘" 카드 안에 **추가**만 하는 것이고, 기존 필드
  표시(값/단위/출처/시각/전일대비)는 그대로 둬야 합니다.
- **막힌 점은 없었습니다** — 순수 로직 구현은 계획대로 끝났습니다. 다만 실제 SVG를
  다크모드에서 어떤 색으로 그릴지는 디자인 판단이 필요해서 Session B가 CSS 변수
  선택 이유를 AI판단 절에 남겨주면 좋겠습니다.

# 오늘의 진짜 정보판 — 엔화/원(JPY/KRW) 환율

실제로 매일 바뀌는 값(엔화→원 환율, 100엔당 원화)을 매일 자동으로 기록하고, 어제와 비교하며,
데이터가 오지 않을 때도 마지막 정상값을 지키며 정직하게 설명하는 무로그인 공개 정보판입니다.

카드 1(매일 궁금한 값 하나), 카드 2(비밀 없는 호출), 카드 3(다섯 가지 실패), 카드 4(하루
한 줄)까지 반영되어 있습니다. 카드 3부터 데이터 모델이 ALEPH 공개 fixture 계약
(`aleph-t04-real-information-board-public-contract-v2`)과 같은 모양으로 바뀌었습니다 —
자세한 내용은 아래 "카드 3" 절 참고.

## 카드 1 통과 기준 — 화면 어디서 확인하나

| 기준 | 내용 | 확인 위치 |
|---|---|---|
| T04-C01 | 결과물·소스 URL이 로그인/인증/CAPTCHA 없이 시크릿 창에서 열림 | Vercel 정적 배포 + 공개 GitHub 저장소 (배포 후 직접 시크릿 창에서 확인 필요) |
| T04-C03 | 비개인 공개 원천의 실제 동적 값을 조회 | `open.er-api.com` (ExchangeRate-API, 무료·무로그인) |
| T04-C04 | 값 표시 | 상단 카드 "100엔 = 871.77원" |
| T04-C05 | 단위 표시 | 상단 카드 "단위: KRW / 100 JPY" |
| T04-C06 | 출처 표시 | 상단 카드 "출처: ExchangeRate-API" (원문 링크 포함) |
| T04-C07 | 출처 시각 표시 | 상단 카드 "출처 시각(KST)" — API의 `time_last_update_utc`를 KST로 환산 |
| T04-C08 | 조회 시각 표시 | 상단 카드 "조회 시각(KST)" — 수집 스크립트 실행 시각 |
| T04-C09 | 기준 시간대 표시 | 페이지 상단 배너 "기준 시간대: Asia/Seoul (KST, UTC+9)" |
| T04-C10 | 정상 1건의 원자료·저장값·화면값 일치 | "정상값 증빙" 섹션 — API 원문 / history.json 저장값 / 화면 표시 문장을 나란히 대조 |
| T04-C25 | 개인정보 0건 | 페이지·수집 과정에 로그인·쿠키·개인 식별 정보 없음 |
| T04-C26 | 5개 실패 재생은 합성 시험값만 사용 | "실패 시나리오 합성 재생 기록" 섹션 — 실제 네트워크를 타지 않고 코드로 조립한 값만 사용 |

## 카드 2 통과 기준 — 비밀 없는 호출 (T04-C11)

**설계 자체가 비밀키를 쓰지 않습니다.** `open.er-api.com`은 API 키가 필요 없는 무료
공개 엔드포인트이고, 브라우저(`app.js`)는 이 외부 API를 절대 직접 호출하지 않습니다 —
같은 오리진에 있는 정적 파일 `data/history.json`, `data/failure_replay.json`만
`fetch()`로 읽습니다. 외부 API 호출은 오직 GitHub Actions 서버에서 `scripts/collect_rate.py`가
수행하는데, 이 스크립트도 `urllib`만 쓰고 어떤 키/토큰도 요구하지 않습니다. 즉 브라우저
개발자 도구의 Network 탭에는 `open.er-api.com`으로 가는 요청 자체가 아예 없습니다
(있다면 그게 오히려 설계에서 벗어난 것입니다).

주장으로 끝내지 않고 `scripts/check_secrets.py`로 실제 검색한 결과 (커밋 `123bb63` 기준 —
커밋을 더 쌓았다면 제출 전 `python3 scripts/check_secrets.py`로 최신 결과를 다시 남기세요):

```
=== 카드 2 — 비밀값 검색 결과 (T04-C11) ===

[1] 작업 트리(배포 파일 전체) 스캔: 텍스트 파일 10개 검사
    → 비밀값 패턴 0건

[2] git 커밋 기록 스캔: 커밋 1개 전체(git log -p) 검사
    → 비밀값 패턴 0건

[3] .env류 파일 존재 여부: 없음

=== 결과: 비밀값 의심 패턴 총 0건 ===
```

이 스크립트는 API 키/토큰/비밀번호/AWS 키/JWT/개인키 블록 등 "비밀값처럼 생긴 문자열"을
정규식으로 찾고, `YOUR_API_KEY` 같은 플레이스홀더는 오탐으로 치지 않습니다. 실제로 비밀값을
심어서 정상적으로 잡아내는지도 확인했습니다(가짜 `API_KEY = "sk_live_..."` 삽입 → 탐지 성공).

`.github/workflows/secret-scan.yml`이 매 push마다 이 스크립트를 자동으로 돌려서, 앞으로
누군가 실수로 키를 커밋해도 그 커밋에서 바로 워크플로가 실패하도록 했습니다(사후 발견이
아니라 사전 차단). GitHub에 올린 뒤에는 아래도 직접 한 번씩 확인해서 "남길 것"에 채워 넣으세요.

- **로컬 재검색**: `python3 scripts/check_secrets.py` 실행 결과 (커밋을 더 쌓았다면 그 시점 기준으로 다시 실행)
- **브라우저 Network 탭**: 배포된 사이트에서 개발자 도구 → Network 탭을 열고 새로고침 —
  `open.er-api.com`으로 가는 요청이 하나도 없고 자기 도메인의 `data/*.json`만 보이는지 확인
- **Git 기록 직접 검색(선택)**: `git log --all -p | grep -iE "key|secret|token|password"` 를
  로컬에서 돌려서 스크립트와 별개로 눈으로도 한 번 훑기

## 카드 3 통과 기준 — 다섯 가지 실패

### ① 공개 fixture 패키지 무결성 확인 (남길 것: package ID·파일 hash 대조)

ALEPH가 배포한 `aleph-t04-real-information-board-public-contract-v2`
(`t04-real-information-board-public-v1.zip`, `asset-manifest.json`)를 받아서 **17개 파일
전부 SHA-256을 직접 계산해 manifest와 대조**했습니다. 전부 일치했고(바이트 수·해시 모두),
압축 안에 들어있는 `asset-manifest.json` 사본도 배포된 원본과 완전히 동일했습니다.

```
OK  README.md                        OK  fixtures/rate-429.json
OK  adapter-reset.example.js         OK  fixtures/recover-d2.json
OK  criterion-registry.json          OK  fixtures/schema-break.json
OK  fixture-manifest.json            OK  fixtures/timeout.json
OK  fixture.schema.json              OK  normalized-reading.schema.json
OK  fixtures/auth-401.json           OK  public-contract.json
OK  fixtures/normal-d1-a.json        OK  reading-status.schema.json
OK  fixtures/normal-d1-b.json
OK  fixtures/normal-d2.json          → ALL MATCH (17/17)
OK  fixtures/offline.json
```

### ② replay adapter와 상태 모델

`adapter/reading-store.js`가 이 카드의 핵심입니다. ALEPH가 준 참조 구현
`adapter-reset.example.js`를 이 저장소로 옮겨온 것으로, 정규화 검증 → 저장 → 상태 전이
로직이 동일합니다. 핵심 규칙 두 가지:

- **성공(`applySuccessfulReading`)**: `signal_id + record_date`가 같으면 새 행을 만들지 않고
  그 행을 갱신합니다(멱등). 날짜가 다르면 새 행이 생깁니다. 전일 대비 변화값은 저장된 두 값을
  다시 계산해서 만듭니다.
- **실패(`applyError`)**: `daily_readings`(일별 기록)를 **절대 건드리지 않습니다.** 상태만
  `{freshness: "stale", error_code: "..."}`로 바뀔 뿐이라서, 마지막 정상값이 실패로 지워지는
  경로 자체가 없습니다(T04-C17). "오래된 값" 표시는 상태가 `stale`일 때 화면이 마지막 행에
  붙이는 배지입니다(T04-C18).

오류 코드는 정확히 5종으로 고정됩니다: `timeout` / `auth`(401·403) / `rate_limit`(429) /
`offline` / `schema_error`. 이 5종은 `scripts/collect_rate.py`(실제 라이브 수집)와
`adapter/reading-store.js`(재생용) 양쪽에서 똑같이 쓰는 분류 체계입니다.

**언어를 통일하지 않은 이유를 밝힙니다.** ALEPH의 참조 구현은 CommonJS(Node)이고, 이 저장소의
실제 라이브 수집기는 카드 1부터 Python(GitHub Actions에서 무의존성으로 돌리기 위함, 사용자의
주 언어이기도 함)입니다. README가 권장하는 "live adapter와 replay adapter가 같은 함수를
호출"하는 정도까지 완전히 통일하려면 라이브 수집기를 Node로 다시 써야 하는데, 카드1·2에서
이미 검증해둔 Python 파이프라인을 갈아엎는 위험을 감수할 만큼 지금 시점에 꼭 필요하지는
않다고 판단했습니다. 대신 **두 구현이 정확히 같은 상태 모델(정규화 9개 필드, `daily_readings`
+ `status` 구조)과 같은 5종 오류 코드 분류 규칙을 쓰도록 맞추고, 각각 독립적으로 검증**했습니다
— JS 쪽은 공식 fixture 9개 전부 재생해서, Python 쪽은 5종 시뮬레이션과 실제 API 성공 응답
샘플 파싱으로. 코드를 공유하진 않지만 동작은 같다는 걸 양쪽에서 직접 확인한 상태입니다. 이
트레이드오프가 마음에 안 들면 다음 카드로 넘어가기 전에 라이브 수집기를 Node로 옮기는 것도
가능하니 말씀해주세요.

### ③ 9개 공식 fixture 전체 재생 결과 (외부 원천 실패 다섯 상태 + 복구)

`scripts/replay_fixtures.js`로 공식 재생 순서(정상 시퀀스, 실패 5종 각각의 baseline+실패,
복구 시퀀스)를 그대로 실행한 결과입니다 — 외부 네트워크 없이 fixture만으로 100% 결정론적:

```
--- 정상 저장 시퀀스 (T04-C20, C21) ---
  [PASS] T04-NORMAL-D1-A — 새 일별 행을 만든다.
  [PASS] T04-NORMAL-D1-B — 새 행 없이 같은 행을 갱신한다.
  [PASS] T04-NORMAL-D2— 새 행과 전일 대비 +15를 만든다.

--- 실패 재생 — T04-TIMEOUT (느린 응답, C12) ---        [PASS] stale/timeout, 마지막 정상값 105 유지
--- 실패 재생 — T04-AUTH-401 (401 거절, C13) ---         [PASS] stale/auth, 마지막 정상값 105 유지
--- 실패 재생 — T04-RATE-429 (호출 제한, C14) ---        [PASS] stale/rate_limit, 마지막 정상값 105 유지
--- 실패 재생 — T04-OFFLINE (오프라인, C15) ---          [PASS] stale/offline, 마지막 정상값 105 유지
--- 실패 재생 — T04-SCHEMA-BREAK (형식 변경, C16) ---    [PASS] stale/schema_error, 마지막 정상값 105 유지

--- 오류 뒤 복구 시퀀스 (T04-C19) ---
  [PASS] T04-TIMEOUT — stale/timeout, 행 1개, 정상값 105
  [PASS] T04-RECOVER-D2 — fresh/none으로 회복, 행 2개(다음 날짜 신규 1건), 정상값 120, 전일 대비 +15

=== 전체 결과: 모두 PASS ===
```

(전체 원문은 로컬에서 `node scripts/replay_fixtures.js --fixtures-dir <공식 패키지의
fixtures 폴더>`로 그대로 재현할 수 있습니다. 공식 fixture 파일 자체는 ALEPH가 배포한
과제 자료라 이 저장소에는 포함하지 않았습니다.)

### ④ 화면에서 "다시 시도"가 보이는 곳 (T04-C19)

상태가 `stale`이면 상단 카드에 마지막 정상값이 "오래됨(stale)" 배지와 함께 보존되어 있고,
그 아래 **"↻ 다시 시도"** 버튼이 뜹니다. 이 버튼은 저장소의 GitHub Actions 워크플로 실행
페이지로 연결됩니다 — 정적 사이트라 브라우저에서 직접 재시도 API를 만들 수는 없지만(그러려면
GitHub 토큰을 브라우저에 넣어야 해서 카드 2 원칙에 어긋납니다), 재시도 행동 자체는 항상
눈에 보이고 실제로 그 워크플로를 실행하면 진짜로 재수집이 일어납니다.

| 기준 | 확인 위치 |
|---|---|
| T04-C12 (타임아웃) | replay_fixtures.js `T04-TIMEOUT` PASS, 화면은 실패 5종 재생 카드의 "타임아웃" |
| T04-C13 (401/403) | replay_fixtures.js `T04-AUTH-401` PASS, 화면 "인증 거절(401/403)" |
| T04-C14 (호출 제한) | replay_fixtures.js `T04-RATE-429` PASS, 화면 "호출 제한(429)" |
| T04-C15 (오프라인) | replay_fixtures.js `T04-OFFLINE` PASS, 화면 "오프라인" |
| T04-C16 (형식 변경) | replay_fixtures.js `T04-SCHEMA-BREAK` PASS, 화면 "응답 형식 변경" |
| T04-C17 (정상값 안 지워짐) | `applyError`가 `daily_readings` 미변경 — 5종 전부 PASS에서 row_count 유지로 확인 |
| T04-C18 (오래된 값 표시) | 상단 카드 "오래됨(stale)" 배지 |
| T04-C19 (재시도 행동 + 복구) | 상단 카드 "↻ 다시 시도" 버튼 + replay_fixtures.js 복구 시퀀스 PASS |

## 카드 4 통과 기준 — 하루 한 줄 (T04-C20, T04-C21)

**① 일별 고유키와 갱신 규칙**

`scripts/collect_rate.py`의 `record_id_for(reading)`가 그 키입니다:

```python
def record_id_for(reading):
    return f"{reading['signal_id']}-{reading['record_date']}"
```

`record_date`는 `fetched_at`(조회 시각)을 기준 시간대(Asia/Seoul)로 환산한 날짜입니다
(`kst_date_of()`). `apply_successful_reading()`은 저장 직전에 같은 `signal_id` +
`record_date`를 가진 행이 이미 있는지 찾고,

- 있으면 → 그 행을 최신 값으로 **덮어씀** (같은 `record_id` 유지, `first_fetched_at`은
  그대로 두고 `last_fetched_at`만 갱신) → 행 수 그대로 (T04-C20)
- 없으면 → 새 행을 **추가** → 행 수 +1 (T04-C21)

이건 새로 만든 로직이 아니라, 카드 3에서 이미 짜뒀던 함수입니다 — 공식 fixture 시퀀스
자체가 "D1-A(같은 날 1번째) → D1-B(같은 날 2번째, 값만 다름) → D2(다음 날)"로 구성되어
있어서, `replay_fixtures.js`가 이미 이 규칙을 전제로 9개 fixture를 채점하고 있었습니다.
카드 4는 그 규칙을 **라이브 수집기(Python) 쪽에서 직접, 합성 시계로 다시 한번** 검증한
카드입니다.

**② 합성 시계 시험 — `scripts/test_same_day_dedup.py`**

실제 네트워크나 `data/history.json`을 건드리지 않고, `collect_rate.py`가 실제로 쓰는
`parse_to_reading` / `apply_successful_reading` 함수를 그대로 불러와, 아래 4개 가상
조회 시각(합성 시계)을 순서대로 먹입니다:

| 순서 | 조회 시각(KST) | 날짜(KST) | 원문 rates.KRW |
|---|---|---|---|
| A | 2026-09-16 00:10 | 2026-09-16 | 8.60 |
| B (재실행) | 2026-09-16 09:00 | 2026-09-16 | 8.65 |
| C (재실행) | 2026-09-16 23:55 | 2026-09-16 | 8.70 |
| D | 2026-09-17 00:15 | 2026-09-17 | 8.75 |

실행 결과(같은 날 재실행 전후 행 수, "남길 것" 항목):

```
[A (같은 날 1번째)] fetched_at=2026-09-16T00:10:00+09:00 record_date=2026-09-16 행수 0 -> 1 (저장값 860.0)
[B (같은 날 2번째, 재실행)] fetched_at=2026-09-16T09:00:00+09:00 record_date=2026-09-16 행수 1 -> 1 (저장값 865.0)
[C (같은 날 3번째, 재실행)] fetched_at=2026-09-16T23:55:00+09:00 record_date=2026-09-16 행수 1 -> 1 (저장값 870.0)
[D (다음 날 1번째)] fetched_at=2026-09-17T00:15:00+09:00 record_date=2026-09-17 행수 1 -> 2 (저장값 875.0)

=== 결과: PASS ===
같은 날짜(2026-09-16) 3번 성공 → 행 수: 1 -> 1 -> 1 (변화 없음, T04-C20)
다음 날짜(2026-09-17) 성공 → 행 수: 1 -> 2 (+1, T04-C21)
증거 저장: data/same_day_dedup_evidence.json
```

같은 날 3번 재실행하는 동안 행 수는 계속 1로 유지되면서도 저장값은 매번 최신화됨(860 →
865 → 870, 그냥 무시된 게 아니라 실제로 덮어써졌다는 증거)을 확인했고, 다음 날짜 1번
성공에서만 행이 2건으로 늘었습니다. `record_id`도 A/B/C는 동일, D는 다르다는 것까지
스크립트 내부 assert로 확인합니다 — 하나라도 어긋나면 exit code 1로 실패합니다.

`.github/workflows/dedup-test.yml`이 push마다 이 스크립트를 실행해서, 앞으로 코드가
바뀌어도 이 규칙이 계속 지켜지는지 자동으로 감시합니다.

**③ 통과 기준 매핑**

| 기준 | 확인 위치 |
|---|---|
| T04-C20 (같은 날 여러 번 성공 → 1건) | `test_same_day_dedup.py` 단계 A/B/C, `dedup-test.yml` PASS |
| T04-C21 (다음 날 성공 → 새 1건) | `test_same_day_dedup.py` 단계 D, `dedup-test.yml` PASS |

## 왜 이런 구조인가 — 기술 스택 설명

### 1. 프론트엔드: 순수 HTML/CSS/JS (프레임워크 없음)
- `index.html`, `style.css`, `app.js` 세 파일이 전부입니다. React/Vue, 빌드 도구 없음.
- `app.js`는 페이지가 열리면 `fetch()`로 `data/history.json`, `data/failure_replay.json`을
  읽어와서 그 내용으로 화면을 채웁니다. 백엔드 API 서버는 없고, 정적 JSON 파일만 읽습니다.
- "정상값 증빙" 섹션은 저장된 API 원문(raw_response)을 그대로 파싱해서 화면에 다시 보여주고,
  그 안에서 실제로 사용한 필드(`time_last_update_utc`, `KRW` 값)를 초록색으로 강조합니다.
  즉 "화면값"이 "저장값"에서, "저장값"이 "원자료"에서 코드로 파생되는 과정이 그대로 보입니다.
- `style.css`는 CSS 변수로 색을 정의하고 `prefers-color-scheme: dark`로 다크 모드를 지원합니다.

### 2. 데이터 수집: Python 표준 라이브러리만 사용
- `scripts/collect_rate.py` 하나. `urllib`(HTTP), `json`, `datetime`, `email.utils`(RFC1123
  시각 파싱), `argparse`만 사용합니다. 외부 라이브러리 설치 없음.
- API가 HTTP 200을 주더라도 본문이 `{"result":"error", ...}`인 경우까지 실패로 잡아냅니다
  (실제 API가 종종 이렇게 "겉보기엔 정상, 속은 실패"로 응답하기 때문입니다).
- 실제 수집과 `--simulate` 실패 재생이 **완전히 같은 파싱·저장 함수**를 지나가므로,
  "재생 화면은 그럴듯한데 실제 실패 시엔 다르게 동작한다"는 일이 생기지 않습니다.
- 저장 상태 모양(`daily_readings` + `status{freshness, error_code}`)과 오류 코드 5종
  (`timeout`/`auth`/`rate_limit`/`offline`/`schema_error`)은 아래 ④의 JS 어댑터와 동일한
  규칙을 씁니다 — 언어는 다르지만 상태 모델은 하나입니다.

### 3. 자동화: GitHub Actions (`.github/workflows/collect-rate.yml`, `secret-scan.yml`)
- 매일 00:10(KST)에 GitHub 서버가 스크립트를 실행하고 결과를 `data/*.json`에 커밋합니다.
  이 대화 세션이나 브라우저와 무관하게 GitHub 인프라에서 독립적으로 돌아갑니다.
- `workflow_dispatch`(수동 실행)에 `failure_type` 선택지가 있어 Actions 탭에서 5가지 실패를
  언제든 재생할 수 있습니다.
- `secret-scan.yml`은 push마다 `check_secrets.py`를 돌려 비밀값 유입을 사전 차단합니다.

### 4. 재생 검증: Node.js (`adapter/reading-store.js`, `scripts/replay_fixtures.js`)
- 브라우저·수집기와 별개로, ALEPH가 준 공식 fixture 9개를 그대로 재생해서 정답과 맞는지
  검증하는 용도로만 Node.js를 씁니다(외부 패키지 없이 Node 내장 기능만 사용).
- `adapter/reading-store.js`가 ALEPH 참조 구현을 옮겨온 상태기계이고, `replay_fixtures.js`가
  그 상태기계에 9개 fixture를 공식 순서대로 먹이면서 기대값과 대조하는 채점기 겸 테스트입니다.
- 왜 Python이 아니라 여기만 JS인지는 "카드 3 통과 기준 → ② replay adapter와 상태 모델"
  절에 트레이드오프를 그대로 적어뒀습니다.

### 4. 배포: Vercel (정적 호스팅)
- 빌드 과정 없는 정적 사이트라 Vercel의 "정적 파일 배포"만으로 충분합니다.
- GitHub Actions가 매일 데이터를 커밋 → Vercel이 변경을 감지해 자동 재배포 → 매일 최신화됩니다.

## 폴더 구조

```
fx-board/
├── index.html              # 화면 구조
├── style.css                # 스타일 (라이트/다크 모드 지원)
├── app.js                   # 데이터 fetch + 렌더링 + 증빙 대조 + 재시도 버튼
├── .gitignore                # .env/키 파일류 방어적 제외
├── adapter/
│   └── reading-store.js     # 재생용 상태기계 — ALEPH 공식 참조 구현 기반 (카드 3)
├── data/
│   ├── history.json                  # 일별 실제 수집 기록 (성공만 누적, 지금은 빈 상태)
│   ├── failure_replay.json           # 5종 실패 합성 재생 기록 (자동 생성)
│   └── same_day_dedup_evidence.json  # 하루 한 줄 합성 시계 시험 증거 (카드 4)
├── scripts/
│   ├── collect_rate.py          # 수집기 (실제 실행 / --simulate 5종 실패 재생, 카드 3 상태모델)
│   ├── check_secrets.py         # 비밀값 검색기 (작업 트리 + git 기록, 카드 2)
│   ├── replay_fixtures.js       # 공식 fixture 9개 재생 채점기 (카드 3, Node 내장 기능만 사용)
│   └── test_same_day_dedup.py   # 같은 날 재실행/다음 날 신규행 합성 시계 시험 (카드 4)
└── .github/workflows/
    ├── collect-rate.yml     # 매일 자동 수집 + 수동 5종 실패 재생 워크플로
    ├── secret-scan.yml      # push마다 비밀값 스캔 (카드 2)
    └── dedup-test.yml       # push마다 하루 한 줄 규칙 시험 (카드 4)
```

## 배포 방법 (직접 진행)

이 폴더는 이미 로컬 git 저장소입니다(커밋 1개 포함, 비밀값 검색 결과도 그 커밋 기준으로
0건 확인됨). GitHub 웹에서 **새 빈 저장소**를 만들고(README/gitignore 자동 생성 옵션은
꺼두세요 — 이미 있어서 충돌합니다) 아래처럼 연결하면 기존 커밋 기록이 그대로 올라갑니다.

```
cd fx-board
git remote add origin https://github.com/<본인계정>/<저장소이름>.git
git branch -M main
git push -u origin main
```

1. 위 명령으로 GitHub에 올립니다 (예: 저장소 이름 `jpy-krw-board`).
2. 저장소 Settings → Actions → General → Workflow permissions를
   **"Read and write permissions"**로 바꿔줍니다. (자동 커밋을 위해 필요합니다.)
3. `app.js` 맨 위의 `SOURCE_URL` 상수를 실제 저장소 주소로 바꿔줍니다.
4. Vercel에서 이 저장소를 "새 프로젝트로 가져오기(Import)" 합니다. 빌드 명령 없이
   정적 파일 그대로 배포하면 됩니다 (Framework Preset: Other / 빌드 명령 비움).
5. 저장소 Actions 탭 → "Collect JPY/KRW rate" 워크플로 → **Run workflow**를 한 번
   수동 실행해서 `failure_type: none`으로 첫 실제 값을 즉시 받아옵니다. 이때
   "정상값 증빙" 섹션도 처음으로 채워집니다 (T04-C10 확인 가능 시점).
6. 배포된 사이트 URL을 새 시크릿 창(로그인 상태 아님)에서 열어 T04-C01을 스스로 확인합니다.
7. (선택) Actions 탭에서 "Collect JPY/KRW rate" 워크플로를 `failure_type`을 바꿔가며
   (timeout/auth/rate_limit/offline/schema_error) 5회 더 수동 실행하면, 사이트의 "실패
   시나리오 합성 재생 기록" 섹션이 채워지고 T04-C12~C19를 실제 배포 환경에서도 눈으로
   확인할 수 있습니다.

> Node.js(`adapter/`, `scripts/replay_fixtures.js`)는 배포에는 전혀 필요 없습니다.
> Vercel은 정적 파일만 서빙하고, 실제 수집은 GitHub Actions의 Python이 담당합니다.
> Node는 오직 로컬에서 "내 로직이 ALEPH 공식 fixture와 맞는지" 스스로 채점할 때만
> 씁니다 — `node scripts/replay_fixtures.js --fixtures-dir <fixture 폴더 경로>`.

## 확인 방법 (제출용, 4줄)

- **위치**: 배포된 사이트 상단 카드와 "일별 기록" 표, 저장소의 `scripts/check_secrets.py`,
  `node scripts/replay_fixtures.js`, `python3 scripts/test_same_day_dedup.py` 실행 결과
- **행동(3단계 이내)**: ① 사이트 접속해서 값·단위·출처·두 시각·기준 시간대(정상 시) 또는
  실패 사유·마지막 정상값(오래됨 표시)·다시 시도 버튼(실패 시)을 확인 → ② Actions에서
  워크플로들을 각각 한 번씩 수동 실행해 재생 기록/일별 기록이 규칙대로만 바뀌는지 확인
  (같은 날 재실행은 표 행이 늘지 않고, 실패는 표를 안 건드림) → ③ 로컬에서
  `python3 scripts/check_secrets.py`, `node scripts/replay_fixtures.js --fixtures-dir <공식
  fixture 폴더>`, `python3 scripts/test_same_day_dedup.py` 3개를 실행
- **통과 모습**: 정상일 땐 값/단위/출처/시각/기준시간대가 모두 보이고, 실패일 땐 5종 중 정확한
  사유와 "오래됨(stale)" 배지가 붙은 마지막 정상값·다시 시도 버튼이 함께 보이며, 일별 기록
  표는 실패로 줄지 않고 같은 날 재수신으로도 늘지 않음. 세 스크립트 모두 정상 종료(비밀값
  0건 / fixture 전부 PASS / 하루-한-줄 PASS)
- **안 될 때 모습**: 정상 기록이 없으면 "기록 없음"으로 정직하게 안내되고(빈 화면·오류 아님),
  `check_secrets.py`가 뭔가 찾거나 `replay_fixtures.js`가 기대값과 다르거나
  `test_same_day_dedup.py`의 assert가 실패하면(같은 날인데 행이 늘거나, 다음 날인데 행이
  안 늘거나) 각각 원인을 출력하고 exit code 1로 실패함

## AI와 나의 판단 (제출용, 3줄 — 실제 진행에 맞춰 다듬어서 제출하세요)

- **AI에게 맡긴 일**: 전체 코드 작성(수집 스크립트의 5종 실패 분류·상태기계·일별 고유키
  갱신 규칙, GitHub Actions 워크플로, 프론트엔드, 비밀값 스캐너), ALEPH 공식 fixture
  패키지의 SHA-256 무결성 검증, 공식 상태 모델과 동일하게 동작하는 JS 재생 어댑터
  (`adapter/reading-store.js`) 작성과 9개 fixture 전량 재생 검증(`replay_fixtures.js`,
  전부 PASS), "마지막 정상값이 실패로 지워지지 않는다"는 요구를 만족하는 저장 로직 설계,
  합성 시계로 같은 날 재실행 3회·다음 날 1회를 시험하는 `test_same_day_dedup.py` 작성과
  검증(PASS)
- **직접 판단한 일**: 추적할 값으로 엔화/원(JPY/KRW)을 선택, 카드 단위로 순서대로 진행하기로
  결정, GitHub 업로드·Vercel 배포·Actions 권한 설정과 5종 실패 재생·하루-한-줄 시험 수동
  실행을 직접 수행
- **AI 제안을 따르지 않은 일**: (실제로 진행하면서 다르게 판단한 부분이 있으면 여기에
  적으세요. 없으면 "특별히 없음 — 제안된 구조를 그대로 채택함"이라고 적으면 됩니다.)

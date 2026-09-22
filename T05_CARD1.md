# 과제 5 — 카드 1: 같은 문제, 같은 검사 (T05-C01~C07)

이 문서는 **AI A가 작업을 시작하기 전에** 고정합니다. 이후 AI A와 AI B는 아래 검사
정의·상한을 바꾸지 않고 그대로 실행해서 통과 여부만 기록합니다.

과제5 카드1의 공식 통과 기준(T05-C01~C07)에 맞춰 처음부터 다시 진행한 버전입니다.
이전에 진행했던 "최근 7일 추이 스파크라인" 인계(커밋 `d676673`~`753b2f5`,
`CHECKS.md`/`HANDOFF.md`)는 이미 완성되어 배포되어 있으므로 그대로 두고, 이번에는
**새로운 작은 개선**으로 같은 실험을 한 번 더, 이번에는 정확한 형식으로 진행합니다.

## 개선 대상 — 최초 요청 (AI A·AI B에 동일하게 적용)

> 과제 4(fx-board)의 "일별 기록" 섹션에 **CSV 다운로드 버튼**을 추가한다. 표에 있는
> 모든 정상 수신 기록(`daily_readings`)을 날짜 오름차순 그대로 CSV로 내보낼 수 있어야
> 하며, 값에 쉼표나 큰따옴표가 있어도 RFC4180 규칙대로 안전하게 이스케이프해야 한다.
> 기존 카드 1~5, 그리고 이미 추가된 스파크라인 기능의 어떤 통과 기준도 깨서는 안
> 된다(회귀 금지).

이 요청 문구는 AI A와 AI B 모두에게 동일하게 적용됩니다. AI A는 이 요청과 아래
검사 10개를 보고 순수 변환 로직을 설계·구현하고 인수인계 문서를 남기며, AI B는
대화 전문 없이 AI A의 인수인계 문서와 이 요청만 보고 이어받아 완성합니다.

## 시작 소스 주소

- 시작 커밋: `6244759` ("docs: README에 과제 5 절 추가...") — 이 커밋 상태에서
  AI A가 시작합니다.
- 저장소 경로: `/home/claude/fx-board` (아직 배포 전, 로컬 상태)

## 고정 검사 10개 (ID · 입력 · 기대값)

| ID | 검사 내용 | 입력 | 기대값 (관찰 가능) | 실행 방법 |
|---|---|---|---|---|
| CSV-01 | 0행일 때 예외 없이 헤더만 반환 | `rows = []` | 반환 문자열이 정확히 1줄(헤더 `record_date,normalized_value,source_time_kst,fetched_time_kst`)이고 예외 발생 없음 | `node scripts/test_csv_export_logic.js` |
| CSV-02 | 1행일 때 헤더+1행 반환 | `rows = [{record_date:"2026-09-17", normalized_value:876.93, source_time_kst:"2026-09-16 09:02:00", fetched_time_kst:"2026-09-17 00:10:05"}]` | 반환 문자열이 정확히 2줄이고, 2번째 줄이 `2026-09-17,876.93,2026-09-16 09:02:00,2026-09-17 00:10:05` | 〃 |
| CSV-03 | 쉼표 포함 값 이스케이프 | `source_time_kst`에 `"09:02, KST"`처럼 쉼표가 섞인 합성 1행 | 해당 필드가 `"09:02, KST"`처럼 큰따옴표로 감싸져 출력되고, 줄을 쉼표로 split했을 때 열 개수가 4개로 유지됨(어긋나지 않음) | 〃 |
| CSV-04 | 큰따옴표 포함 값 이스케이프 | `source_time_kst`에 `9시 "정각"`처럼 큰따옴표가 섞인 합성 1행 | 큰따옴표가 `""`로 이중 처리되고 전체 필드가 따옴표로 감싸짐 (`"9시 \"\"정각\"\""`) | 〃 |
| CSV-05 | 행 순서 유지(정렬하지 않음) | 날짜가 09-19, 09-17, 09-18 순으로 이미 섞여 들어온 3행 | 출력 CSV의 행 순서가 입력 배열 순서(09-19→09-17→09-18)와 정확히 같음 — 함수는 정렬하지 않고 호출자가 준 순서를 그대로 씀 | 〃 |
| CSV-06 | 실제 데이터 렌더링 시 버튼 존재 | `data/history.json` 실제 5건 렌더링 | "일별 기록" 섹션(`#history-table` 근처)의 DOM에 `CSV 다운로드` 버튼이 실제로 존재 | Playwright(로컬 http.server) |
| CSV-07 | 버튼 클릭 결과가 순수 함수와 일치 | 위와 동일 데이터, 버튼 클릭 | 생성되는 CSV 내용이 `rowsToCsv(state.daily_readings)` 순수 함수의 반환값과 문자열 단위로 완전히 동일 | Playwright |
| CSV-08 | 접근성 | 위와 동일 | 버튼에 접근 가능한 이름(보이는 텍스트 또는 `aria-label`)이 있고, Tab으로 포커스되고 Enter로 실행됨 | Playwright |
| CSV-09 | 기존 6개 섹션 회귀 없음 | 위와 동일 데이터 | 오늘 카드(스파크라인 포함)/정상값 증빙/일별 기록 표 자체/실제 이틀 대조/실패 재생/이 정보판에 대해 — 6개 섹션 모두 버튼 추가 전과 동일하게 렌더링, 페이지 콘솔 에러 0건(브라우저 자체 요청인 favicon 404 제외) | Playwright |
| CSV-10 | 비밀값 0건 + 외부 의존성 없음 | 저장소 전체 | `check_secrets.py` exit code 0, `git diff`에 외부 `<script src="http...">`/CDN/`require`/`import` 추가 없음, `package.json`/`node_modules` 없음 | `python3 scripts/check_secrets.py` + `git diff`/`grep` |

## 공통 사용 상한 (AI A, AI B 각각에 동일하게 적용)

- **시간 상한: 세션당 20분 이내** (아래 "AI A/AI B 시작·종료 기록"의 실제 시각 기준)
- **호출 수 상한: Bash/파일 도구 호출 40회 이하**
- 파일 상한: 신규/수정 파일 8개 이하
- 커밋 상한: 1개
- 외부 네트워크: 0회 — 순수 JS/Python 표준 라이브러리만

## AI A / AI B 시작·종료 기록 (작업이 실제로 진행되며 채워짐)

| 단계 | 시각(UTC) | 비고 |
|---|---|---|
| 기준선 확정(이 문서 커밋 `75fd977`) | 2026-09-22T07:21:57Z | 아직 AI A는 시작 전 |
| AI A 시작 | 2026-09-22T07:22:00Z | `date -u` 명령으로 실제 캡처, 작업 착수 직전 |
| AI A 종료·인수인계 | 2026-09-22T07:23:03Z | 경과 약 63초 — 시간 상한(20분) 내 |
| AI B 시작 | 2026-09-22T07:23:38Z | `date -u` 명령으로 실제 캡처, 문서를 읽기 직전 |
| AI B 종료 | 2026-09-22T07:25:21Z | `date -u` 실제 캡처(커밋 직전) — 경과 1분 43초, 시간 상한(20분) 내 |

## 검사 결과 기록 표 (양쪽 세션이 채워 넣음)

| ID | AI A 인계 시점 | AI B 완료 시점 |
|---|---|---|
| CSV-01 | HANDOFF ④ 스냅샷: PASS | PASS — `node scripts/test_csv_export_logic.js` 재실행 |
| CSV-02 | HANDOFF ④ 스냅샷: PASS | PASS — 같은 스크립트 재실행 |
| CSV-03 | HANDOFF ④ 스냅샷: PASS | PASS — 같은 스크립트 재실행 |
| CSV-04 | HANDOFF ④ 스냅샷: PASS | PASS — 같은 스크립트 재실행 |
| CSV-05 | HANDOFF ④ 스냅샷: PASS | PASS — 같은 스크립트 재실행 |
| CSV-06 | HANDOFF ④ 스냅샷: PENDING | PASS — Playwright: `#history-table`이 있는 섹션 안에 role=button, 이름 "CSV 다운로드" 1개, 활성 상태 |
| CSV-07 | HANDOFF ④ 스냅샷: PENDING | **FAIL(정의 그대로 실행 시)** — `data/history.json`의 행에는 `source_time_kst`/`fetched_time_kst` 키가 없어 `rowsToCsv(state.daily_readings)`는 3·4열이 빈 CSV를 냄. 버튼은 `reading.source_time`/`fetched_at`을 KST `YYYY-MM-DD HH:MM:SS`로 투영한 행에 `rowsToCsv`를 적용하므로 다운로드 파일은 `rowsToCsv(투영된 행)`과 문자열 완전 일치(PASS), 문자 그대로의 `rowsToCsv(state.daily_readings)`와는 불일치 |
| CSV-08 | HANDOFF ④ 스냅샷: PENDING | PASS — aria-label "일별 기록 CSV 다운로드"(보이는 텍스트 포함), Tab 반복으로 포커스 도달, Enter로 다운로드 이벤트 발생 |
| CSV-09 | HANDOFF ④ 스냅샷: PENDING | PASS — 변경 전(HEAD 88c8e53) vs 후 6개 섹션 innerHTML 비교: 5개 동일, 일별 기록 섹션은 버튼 영역 제거 후 공백 정규화 시 동일(`#history-table` outerHTML 완전 동일), `#today-card svg` 1개 유지, 콘솔 에러 0건 |
| CSV-10 | HANDOFF ④ 스냅샷: PASS | PASS — `check_secrets.py` exit 0, `git diff`에 외부 script/CDN/require/import 추가 0건, `package.json`/`node_modules` 없음 |

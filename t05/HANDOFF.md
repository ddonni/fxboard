# 인수인계 — 과제 5 최종 실행 (AI A → AI B)

## 1. 목표

fx-board(오늘의 진짜 정보판)의 "일별 기록" 표(`#history-table`)에 제목이 정확히 `전일 대비`인 열을 추가한다.
각 행에 `daily-change.js`의 `label`을 그대로 표시한다(예: `▲ +4.95`, `▼ -1.43`, `= 0.00`, 가장 이른 날짜는 `—`).
기존 4개 열과 다른 섹션은 그대로 둔다. 원문 요청은 `t05/REQUEST.md`, 검사 10개는 `t05/CHECKS.md`.

## 2. 현재 상태

- 커밋 1(작업 커밋) 전체 ID: `e44baf13cbd2b8ca0deac732d27a2769ddaf5e42` (기준선은 `75bb6e5`, 태그 `t05f-baseline`)
- 끝난 일: 루트의 `daily-change.js`(순수 계산 모듈, UMD). Node는 `require("./daily-change.js").computeDailyChanges`,
  브라우저는 `window.DailyChange.computeDailyChanges`. 입력은 `data/history.json`의 `daily_readings` 행을 그대로 넣으면 된다.
  반환은 날짜 오름차순의 새 배열이며 원소는 `{ record_date, value, delta, direction, label }`.
- 안 한 일(AI B 몫): 화면 통합. `index.html`, `app.js`, `style.css`는 기준선 그대로다.
- 화면 통합에 필요한 사실:
  - `index.html` 34행 부근 `<table id="history-table">`, 43행 `<tbody id="history-tbody">`. 헤더 `<th>`는 `<thead>`에 4개(날짜(KST) / 100엔당 KRW / 출처 시각(KST) / 조회 시각(KST)).
  - 스크립트는 `index.html` 89~91행에서 `sparkline.js`, `csv-export.js`, `app.js` 순으로 불러온다. `daily-change.js`는 `app.js`보다 앞에 `<script src="daily-change.js"></script>`로 추가해야 한다.
  - `app.js`의 `renderHistoryTable(state)`(226행 부근)가 행을 만든다. 이 함수는 표를 **날짜 내림차순(최신이 위)** 으로 그린다. 그래서 `computeDailyChanges(state.daily_readings)`의 결과를 `record_date`로 찾아 각 행에 붙이면 된다. 행의 첫 칸(날짜)이 `record_date`다.
  - 검사 DC-07은 각 행의 첫 칸을 날짜 키로, `전일 대비` 열 위치를 헤더에서 찾아 비교한다. DC-09는 기존 4개 열의 텍스트가 기준선과 같아야 한다.
  - 화면 검사(DC-07~09)는 실제 `data/history.json`이 아니라 기준선의 데이터 5건을 브라우저에 공급한다.

## 3. 실행 명령

새 폴더에서 처음부터 따라 하는 순서:

```bash
# 필요 버전: Node 18 이상(확인한 버전 v22.22.2), Python 3(3.11.15), git 2.x
# 필요 도구: npm 전역 playwright와 Chromium (이미 설치되어 있음 — 설치 명령 없음, 외부 네트워크 사용 안 함)
git clone <이 저장소 경로> fx-board      # 또는 기존 작업 폴더 그대로 사용
cd fx-board                              # 작업 폴더 = 저장소 루트
git checkout e44baf13cbd2b8ca0deac732d27a2769ddaf5e42                         # (선택) AI A 작업 커밋 시점으로 확인할 때

# 환경값 예시 (이 환경에서는 PLAYWRIGHT_BROWSERS_PATH가 이미 설정되어 있어 생략 가능)
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export NODE_PATH=$(npm root -g)          # playwright를 못 찾을 때만

node t05/run_checks.js                   # 작업 트리 검사, t05/runs.jsonl에 한 줄 추가
node t05/run_checks.js --target <커밋>   # 특정 커밋 검사(기록 안 함)
```

환경 변수 중 필수는 없다. 실행 결과는 `t05/runs.jsonl`에 쌓이므로 지우거나 고치지 말고 커밋에 포함한다.

## 4. 통과 검사

마지막 실행(`t05/runs.jsonl` 마지막 줄, 작업 트리 검사) 결과 8/10:

| ID | 결과 |
|---|---|
| DC-01 | PASS |
| DC-02 | PASS |
| DC-03 | PASS |
| DC-04 | PASS |
| DC-05 | PASS |
| DC-06 | PASS |
| DC-07 | FAIL — 헤더에 "전일 대비" 열 없음 |
| DC-08 | FAIL — 열 없음 |
| DC-09 | PASS (화면을 아직 안 건드려서 통과. 통합 후에도 유지해야 함) |
| DC-10 | PASS |

## 5. 남은 문제

첫 실패 검사: **DC-07**. `#history-table` 헤더에 `전일 대비` 열이 없다(현재 헤더 4개뿐). DC-08도 같은 원인이다.
둘 다 화면 통합이 되면 풀린다. 그 밖의 알려진 문제는 없다.

## 6. 다음 행동

1. `index.html`: `app.js` 앞에 `<script src="daily-change.js"></script>` 추가, `<thead>`에 `<th>전일 대비</th>` 추가.
2. `app.js`의 `renderHistoryTable`: `window.DailyChange.computeDailyChanges(state.daily_readings)` 결과를 날짜별로 찾아 각 행 끝에 `<td>`로 `label` 표시(`textContent`로).
3. 필요하면 `style.css`에 열 정렬·색(상승/하락은 `direction`으로 구분) 추가. 기호와 글자는 label 그대로 두고 색만 더한다.
4. 표에 열이 늘었으니 `index.html`의 표 아래 안내문이나 `colspan`(빈 상태 행 등)이 있으면 맞춘다.
5. `node t05/run_checks.js`로 10개 확인 → `t05/SESSION_LOG.md`의 "AI B" 행과 인수인계 누락 기록 작성 → 커밋.

## 7. 건드리지 말 것

- `t05/REQUEST.md`, `t05/CHECKS.md`, `t05/run_checks.js` (검사 삭제·완화·기대값 변경 금지)
- `t05/runs.jsonl`의 기존 줄 (새 줄 추가만)
- `data/` 아래 실제 데이터 파일
- `daily-change.js`의 계약(함수 이름, 반환 필드, label 형식) — 이미 DC-01~06 통과
- 루트의 `CHECKS.md`, `HANDOFF.md`, `T05_*.md`, `scripts/run_t05_checks.js`는 이전 시도 기록이며 이번 작업과 무관

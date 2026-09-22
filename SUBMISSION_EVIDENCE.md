# 과제 4 제출 증거 정리 — 카드 1~5

카드별 "남길 것" 항목과, 그 항목을 실제로 어디에 남겨뒀는지를 정리했습니다. 각 항목은
저장소(`fx-board.zip`) 안의 정확한 파일 경로를 가리키므로, 제출 폼에 경로를 그대로
적거나 해당 파일/섹션을 캡처해서 첨부하면 됩니다.

---

## 카드 1 — 매일 궁금한 값 하나 (T04-C01, C03~C10, C25, C26)

**남길 것**: 정상 기록 1건의 원자료·저장값·화면값 대조

| 항목 | 남긴 위치 |
|---|---|
| 값/단위/출처/출처시각/조회시각/기준시간대가 한 화면에 표시 | 배포된 사이트 상단 "오늘" 카드 + 상단 배너 (`index.html` `#today-card`, `#ref-tz-banner`) |
| 정상 기록 1건의 원자료·저장값·화면값 대조 | 사이트 "정상값 증빙" 섹션 (`index.html` `#evidence-body`, 렌더링 코드는 `app.js`의 `renderEvidence()`) — API 원문(raw_response) / `history.json` 저장값 / 화면 표시 문장 3열을 나란히 보여줌 |
| 실제 원본 데이터 (참고용) | `data/history.json` (5건 실제 기록, `reading.raw_response`에 API 원문 전체 보존) |

## 카드 2 — 비밀 없는 호출 (T04-C11)

**남길 것**: 클라이언트·네트워크·저장소 비밀값 검색 결과

| 항목 | 남긴 위치 |
|---|---|
| 저장소(작업 트리 + git 커밋 기록) 비밀값 검색 결과 | `scripts/check_secrets.py` 실행 결과 — 아래 "최신 실행 결과" 참고, 스크립트 자체는 저장소에 포함 |
| 자동 반복 검증 | `.github/workflows/secret-scan.yml` (push마다 자동 실행) |
| 브라우저/네트워크 확인 절차 | `README.md` "카드 2 통과 기준" 절 — 배포된 사이트 개발자도구 Network 탭에서 `open.er-api.com` 요청이 없는지 확인하는 절차 명시 |

**최신 실행 결과** (커밋 6개 기준):
```
=== 카드 2 — 비밀값 검색 결과 (T04-C11) ===

[1] 작업 트리(배포 파일 전체) 스캔: 텍스트 파일 18개 검사
    → 비밀값 패턴 0건

[2] git 커밋 기록 스캔: 커밋 6개 전체(git log -p) 검사
    → 비밀값 패턴 0건

[3] .env류 파일 존재 여부: 없음

=== 결과: 비밀값 의심 패턴 총 0건 ===
```

## 카드 3 — 다섯 가지 실패 (T04-C12~C19)

**남길 것**: 공식 fixture 패키지 무결성 대조, 5종 실패 재생 결과, 복구 시퀀스 결과

| 항목 | 남긴 위치 |
|---|---|
| 공식 fixture 패키지(17개 파일) SHA-256 대조표 | `README.md` "카드 3 통과 기준 → ①" — ALL MATCH (17/17) |
| 5종 실패(timeout/auth/rate_limit/offline/schema_error) 재생 결과 | `scripts/replay_fixtures.js` 실행 로그 (`README.md` "카드 3 통과 기준 → ③"에 전문 포함), 화면상으로는 "실패 시나리오 합성 재생 기록" 섹션 |
| 마지막 정상값이 실패로 지워지지 않는다는 근거 | `adapter/reading-store.js`의 `applyError()` — `daily_readings` 미변경, `replay_fixtures.js`가 5종 전부에서 row_count 유지를 확인 |
| 오래된 값 표시 + 재시도 버튼 | 사이트 "오늘" 카드 — stale 상태일 때 "오래됨(stale)" 배지 + "↻ 다시 시도" 버튼 |
| 실제 라이브 수집기(Python)에서의 5종 재생 결과 | `data/failure_replay.json` (5종 각각의 재생 기록, `scripts/collect_rate.py --simulate <종류>`로 생성) |
| 기준 매핑표 | `README.md` "카드 3 통과 기준" 절 맨 아래 표 (T04-C12~C19) |

## 카드 4 — 하루 한 줄 (T04-C20, T04-C21)

**남길 것**: 같은 날 재실행 전후 행 수

| 항목 | 남긴 위치 |
|---|---|
| 같은 날 재실행 전후 행 수 | `data/same_day_dedup_evidence.json` (합성 시계 A/B/C/D 4단계 각각의 `row_count_before`/`row_count_after`), 로그는 아래 참고 |
| 검증 스크립트 | `scripts/test_same_day_dedup.py` |
| 자동 반복 검증 | `.github/workflows/dedup-test.yml` (push마다 자동 실행) |
| 실제 라이브 수집기 로직 근거 | `scripts/collect_rate.py`의 `record_id_for()` / `apply_successful_reading()` (일별 고유키 = `signal_id + record_date`, 존재하면 덮어쓰고 없으면 추가) |

**최신 실행 결과**:
```
[A (같은 날 1번째)] fetched_at=2026-09-16T00:10:00+09:00 record_date=2026-09-16 행수 0 -> 1 (저장값 860.0)
[B (같은 날 2번째, 재실행)] fetched_at=2026-09-16T09:00:00+09:00 record_date=2026-09-16 행수 1 -> 1 (저장값 865.0)
[C (같은 날 3번째, 재실행)] fetched_at=2026-09-16T23:55:00+09:00 record_date=2026-09-16 행수 1 -> 1 (저장값 870.0)
[D (다음 날 1번째)] fetched_at=2026-09-17T00:15:00+09:00 record_date=2026-09-17 행수 1 -> 2 (저장값 875.0)

=== 결과: PASS ===
같은 날짜(2026-09-16) 3번 성공 → 행 수: 1 -> 1 -> 1 (변화 없음, T04-C20)
다음 날짜(2026-09-17) 성공 → 행 수: 1 -> 2 (+1, T04-C21)
```

## 카드 5 — 실제 이틀과 어제 대비 (T04-C22~C24, C27, C28)

**남길 것**: 서로 다른 KST 날짜의 실제 기록 2건 / 각 기록의 출처·시각·값·단위와 저장값·화면값
대조 / 두 값의 어제 대비 변화 재계산

| 항목 | 남긴 위치 |
|---|---|
| 서로 다른 KST 날짜의 실제 기록 2건(이상) | `data/history.json` — 실제 5건(2026-09-17~09-21), 모두 실제 배포 사이트가 진짜로 수집한 값 |
| 각 기록의 출처·시각·값·단위와 저장값·화면값 대조 | 사이트 "실제 이틀 대조 — 어제 대비 재계산" 섹션 (`index.html` `#day-pair-body`, `app.js`의 `renderDayPairSection()`), `data/day_pair_evidence.json` |
| 두 값의 어제 대비 변화 재계산 | `scripts/verify_day_pair.py` 실행 결과 (아래 참고) — 화면과 독립적으로 Python 코드가 다시 뺄셈해서 확인 |
| 확인 방법 4단 구분(T04-C27) | `README.md` "확인 방법" 절 |
| 제출문 3단 구분(T04-C28) | `README.md` "AI와 나의 판단" 절 |

**최신 실행 결과(실제 데이터)**:
```
[PASS] 이전 날 2026-09-20: 882.14 KRW/100JPY (출처 시각 2026-09-19T09:02:31+09:00)
[PASS] 최근 날 2026-09-21: 880.71 KRW/100JPY (출처 시각 2026-09-20T09:02:31+09:00)
재계산한 어제 대비 변화: -1.43KRW
저장된 last_delta(화면 '전일 대비' 표시값)와 일치: True
(전체 실제 기록 5건 중 가장 최근 인접한 두 건을 사용)
```

---

## 요약 — 카드별 핵심 증거 파일 한눈에 보기

| 카드 | 핵심 증거 파일 |
|---|---|
| 1 | `index.html`(#evidence-body) + `data/history.json` |
| 2 | `scripts/check_secrets.py` 실행 결과 + `.github/workflows/secret-scan.yml` |
| 3 | `README.md`(카드3 절, SHA-256 표 + replay_fixtures.js 로그) + `data/failure_replay.json` |
| 4 | `data/same_day_dedup_evidence.json` + `scripts/test_same_day_dedup.py` |
| 5 | `data/day_pair_evidence.json` + `data/history.json` + `scripts/verify_day_pair.py` |

모든 파일은 이미 전달드린 `fx-board.zip`(git 커밋 6개 포함) 안에 들어 있습니다. 제출 폼이
파일 첨부를 요구하면 위 표의 경로를, 텍스트/캡처를 요구하면 이 문서의 각 코드블록을 그대로
쓰시면 됩니다.

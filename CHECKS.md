# 과제 5 — 고정 검사 10개 + 공통 사용 상한

**이 문서는 작업 시작 전에 확정합니다.** 이후 Session A와 Session B는 이 문서의 검사
정의를 절대 바꾸지 않고, 그대로 실행해서 통과 여부만 기록합니다(검사 자체를 손보고
싶으면 별도로 사유를 남기고 새 버전을 만들어야 합니다 — 이번 과제에서는 없었습니다).

## 개선 대상

fx-board(과제 4, 오늘의 진짜 정보판) 사이트의 "오늘" 카드에 **최근 7일 추이 미니
차트(스파크라인)** 를 추가합니다. 저장된 `daily_readings` 중 최근 최대 7건을 이용해
방향(상승/하락/횡보)을 한눈에 보여주는 작은 SVG 선 그래프입니다. 기존 카드 1~5의
어떤 통과 기준도 깨서는 안 됩니다(회귀 금지).

## 고정 검사 10개

| # | 검사 내용 | 실행 방법 |
|---|---|---|
| 1 | 정상 기록이 0건일 때 스파크라인 계산 함수가 예외 없이 "데이터 없음" 상태를 반환한다 | `node scripts/test_sparkline_logic.js` |
| 2 | 정상 기록이 1건일 때도 예외 없이 값(점 1개 또는 안내 상태)을 반환한다 | 〃 |
| 3 | 정상 기록이 8건 이상일 때 정확히 최근 7건만 사용한다 | 〃 |
| 4 | 반환된 포인트 개수가 실제로 사용한 데이터 행 수와 정확히 같다 | 〃 |
| 5 | 값이 계속 상승/하락/횡보하는 3가지 합성 케이스에서 추세 판정(`trend: "up"/"down"/"flat"`)이 올바르다 | 〃 |
| 6 | 실제 배포 데이터로 렌더링했을 때 `#today-card` 안에 스파크라인 `<svg>`가 실제로 존재한다 | Playwright로 로컬 렌더링 후 DOM 확인 |
| 7 | 스파크라인에 대체 텍스트(`aria-label` 또는 `title`)가 있고, 그 안에 최솟값·최댓값·추세 방향이 텍스트로 포함된다 | Playwright로 속성값 확인 |
| 8 | 기존 5개 섹션(오늘 카드 본문/정상값 증빙/일별 기록/실제 이틀 대조/실패 재생 기록)이 스파크라인 추가 후에도 여전히 정상 렌더링된다(회귀 없음) | Playwright로 각 섹션 텍스트 존재 확인 |
| 9 | `python3 scripts/check_secrets.py`가 비밀값 0건을 유지한다 | 스크립트 실행, exit code 0 |
| 10 | 신규 코드가 외부 라이브러리·CDN 없이 순수 JS/HTML/CSS로만 구현됐다(새 `<script src="http...">`, `package.json` 등 의존성 파일 없음) | `git diff` 및 `grep` 확인 |

## 공통 사용 상한 (Session A, Session B 각각에 적용)

- 신규/수정 파일 **8개 이하**
- git 커밋 **1개** (세션당)
- Bash/파일 도구 호출 **40회 이하**
- 외부 네트워크 접속(패키지 설치 등) **0회** — 순수 JS/Python 표준 라이브러리만

세션은 인계 시점에 "지금까지 몇 개 썼는지"를 HANDOFF.md에 정확히 남겨서, 다음 세션이
남은 예산을 알 수 있게 합니다.

## 검사 결과 기록 표 (양쪽 세션이 채워 넣음)

| # | Session A 인계 시점 | Session B 완료 시점 |
|---|---|---|
| 1 | PASS || PASS — `node scripts/test_sparkline_logic.js` 재실행, #1 PASS |
| 2 | PASS || PASS — 동일 스크립트 #2 PASS. 브라우저에서도 1건 데이터로 예외 없이 점 1개 + 안내 문구 표시 확인 |
| 3 | PASS || PASS — 동일 스크립트 #3 PASS. 브라우저에서도 8건 합성 데이터로 path 포인트 7개 확인 |
| 4 | PASS || PASS — 동일 스크립트 #4 PASS |
| 5 | PASS || PASS — 동일 스크립트 #5 PASS (EPSILON 0.005 기준 변경 없음) |
| 6 | PENDING (DOM 미통합) || PASS — Playwright(Chromium, 로컬 http.server)로 실제 `data/history.json`(5건) 렌더링, `#today-card svg` 존재, path `M 4 32 L 42 16.89 L 80 4 L 118 16.09 L 156 20.46` (라이트·다크 모두) |
| 7 | PENDING (DOM 미통합) || PASS — `aria-label`(및 `<title>`) = "최근 5일 추이: 876.93원 ~ 886.1원, 상승" — 최솟값·최댓값·추세 모두 포함, `role="img"` |
| 8 | PENDING (DOM 변경 없음) || PASS — 변경 전 커밋(ff59883) 렌더링과 텍스트 비교: 오늘 카드 본문(스파크라인 블록 제외)/정상값 증빙/일별 기록(5행)/실제 이틀 대조/실패 재생(5건) 모두 공백 정규화 후 동일, 페이지 JS 오류 0건 |
| 9 | PASS || PASS — `python3 scripts/check_secrets.py` 비밀값 0건, exit 0 |
| 10 | PASS || PASS — `git diff`에 외부 URL `<script src>`/CDN/`require`/`import` 추가 없음, `package.json`·`node_modules` 없음, 추가된 스크립트는 로컬 `sparkline.js`뿐 |

세부 근거는 `HANDOFF.md`의 "④ 고정 검사 10개 — 인계 시점 스냅샷" 참고. Session B는
자신의 결과를 "Session B 완료 시점" 열에 채우세요.

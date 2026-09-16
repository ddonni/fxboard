# 오늘의 진짜 정보판 — 엔화/원(JPY/KRW) 환율

실제로 매일 바뀌는 값(엔화→원 환율, 100엔당 원화)을 매일 자동으로 기록하고, 어제와 비교하며,
데이터가 오지 않을 때도 마지막 정상값을 지키며 정직하게 설명하는 무로그인 공개 정보판입니다.

카드 1(매일 궁금한 값 하나), 카드 2(비밀 없는 호출)까지 반영되어 있습니다.

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
- 실제 수집과 `--simulate` 실패 재생이 **완전히 같은 파싱 함수(`parse_payload`)**를 지나가므로,
  "재생 화면은 그럴듯한데 실제 실패 시엔 다르게 동작한다"는 일이 생기지 않습니다.

### 3. 자동화: GitHub Actions (`.github/workflows/collect-rate.yml`)
- 매일 00:10(KST)에 GitHub 서버가 스크립트를 실행하고 결과를 `data/*.json`에 커밋합니다.
  이 대화 세션이나 브라우저와 무관하게 GitHub 인프라에서 독립적으로 돌아갑니다.
- `workflow_dispatch`(수동 실행)에 `failure_type` 선택지가 있어 Actions 탭에서 5가지 실패를
  언제든 재생할 수 있습니다.

### 4. 배포: Vercel (정적 호스팅)
- 빌드 과정 없는 정적 사이트라 Vercel의 "정적 파일 배포"만으로 충분합니다.
- GitHub Actions가 매일 데이터를 커밋 → Vercel이 변경을 감지해 자동 재배포 → 매일 최신화됩니다.

## 폴더 구조

```
fx-board/
├── index.html              # 화면 구조
├── style.css                # 스타일 (라이트/다크 모드 지원)
├── app.js                   # 데이터 fetch + 렌더링 + 증빙 대조
├── .gitignore                # .env/키 파일류 방어적 제외
├── data/
│   ├── history.json         # 일별 실제 수집 기록 (자동 생성/갱신, 지금은 빈 상태)
│   └── failure_replay.json  # 5종 실패 합성 재생 기록 (자동 생성, 로컬에서 1회 미리 생성해둠)
├── scripts/
│   ├── collect_rate.py      # 수집기 (실제 실행 / --simulate 실패 재생)
│   └── check_secrets.py     # 비밀값 검색기 (작업 트리 + git 기록, 카드 2)
└── .github/workflows/
    ├── collect-rate.yml     # 매일 자동 수집 + 수동 실패 재생 워크플로
    └── secret-scan.yml      # push마다 비밀값 스캔 (카드 2)
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

## 확인 방법 (제출용, 4줄)

- **위치**: 배포된 사이트 상단 카드("100엔 = OOO원" 카드), 그 아래 "정상값 증빙" 섹션,
  브라우저 개발자 도구 Network 탭, 저장소의 `scripts/check_secrets.py` 실행 결과
- **행동(3단계 이내)**: ① 사이트 접속(시크릿 창)해서 값·단위·출처·두 시각·기준 시간대와
  증빙 3열 대조 확인 → ② Network 탭을 열고 새로고침해 `open.er-api.com` 요청이 없는지
  확인 → ③ 로컬에서 `python3 scripts/check_secrets.py` 실행
- **통과 모습**: 값/단위/출처/시각/기준시간대가 카드에 모두 보이고, Network 탭에는 같은
  도메인의 `data/*.json` 요청만 보이며, 스캔 스크립트가 "비밀값 의심 패턴 총 0건"으로 종료
  (exit code 0)
- **안 될 때 모습**: 정상 기록이 없으면 "기록 없음"으로 정직하게 안내되고(빈 화면·오류 아님),
  스캔 스크립트가 뭔가 찾으면 파일명·줄 번호와 함께 출력하고 exit code 1로 실패함
  (GitHub Actions의 secret-scan 워크플로도 이 시점에 함께 실패로 표시됨)

## AI와 나의 판단 (제출용, 3줄 — 실제 진행에 맞춰 다듬어서 제출하세요)

- **AI에게 맡긴 일**: 전체 코드 작성(수집 스크립트, GitHub Actions 워크플로, 프론트엔드,
  비밀값 스캐너), 값/단위/출처/두 시각/기준시간대 표시 설계, 원자료·저장값·화면값 대조 증빙
  섹션 설계, 5종 실패 재생과 비밀값 스캔 로직의 탐지 여부 검증(가짜 실패/가짜 키로 시험)
- **직접 판단한 일**: 추적할 값으로 엔화/원(JPY/KRW)을 선택, 카드 단위로 순서대로 진행하기로
  결정, GitHub 업로드·Vercel 배포·Actions 권한 설정을 직접 수행
- **AI 제안을 따르지 않은 일**: (실제로 진행하면서 다르게 판단한 부분이 있으면 여기에
  적으세요. 없으면 "특별히 없음 — 제안된 구조를 그대로 채택함"이라고 적으면 됩니다.)

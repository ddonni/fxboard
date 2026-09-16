#!/usr/bin/env python3
"""
오늘의 진짜 정보판 — 엔화/원(JPY→KRW) 수집기 (카드 1~3)

카드 3부터는 ALEPH 공개 fixture 계약(aleph-t04-real-information-board-public-contract-v2,
normalized-reading.schema.json / reading-status.schema.json)과 같은 상태 모델을 씁니다:

  - 저장 상태는 {status: {freshness, error_code}, daily_readings: [...], last_run} 형태입니다.
  - daily_readings는 "성공한 날짜"만 담습니다 — adapter/reading-store.js의 applyError()가
    daily_readings를 절대 건드리지 않는 것과 똑같이, 이 스크립트도 실패 시 daily_readings에
    아무것도 추가/삭제/수정하지 않습니다. 그래서 "마지막 정상값"은 항상 daily_readings의
    마지막 행이고, 실패해도 지워질 수가 없는 구조입니다(T04-C17).
  - 오류 코드는 정확히 5종: timeout / auth / rate_limit / offline / schema_error.
    (adapter/reading-store.js, scripts/replay_fixtures.js와 같은 분류 체계이고, 실제로
    9개 공식 fixture를 그 JS 상태기계로 재생해서 정답과 일치함을 확인했습니다. 이 Python
    스크립트는 같은 코드를 "실행"하지는 않지만 — 파이썬과 JS라 런타임을 공유할 수는 없어서 —
    같은 상태 모델·같은 오류 코드 분류 규칙을 그대로 옮겨서 동작을 맞췄습니다.)

- 정상 실행: open.er-api.com 공개 API(무료, 키 불필요)에서 JPY 기준 환율을 가져와 저장.
- 실패 시뮬레이션(--simulate): 실제 네트워크를 타지 않고 5가지 외부 실패 유형 중 하나를
  인위적으로 재현해서, 정상 실행과 완전히 동일한 파싱/저장 함수를 통과시킨다. 결과는
  data/history.json이 아니라 data/failure_replay.json에 남아 실제 기록과 섞이지 않는다.

표준 라이브러리만 사용한다 (외부 의존성 없음).
"""
import argparse
import copy
import datetime
import email.utils
import json
import os
import urllib.error
import urllib.request

API_URL = "https://open.er-api.com/v6/latest/JPY"
SIGNAL_ID = "jpy-krw-100"
UNIT = "KRW/100JPY"
UNIT_LABEL_KO = "KRW / 100 JPY (100엔당 원)"
SOURCE_NAME = "ExchangeRate-API (open.er-api.com)"
REFERENCE_TZ_LABEL = "Asia/Seoul (KST, UTC+9)"
TIMEOUT_SECONDS = 8

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_PATH = os.path.join(REPO_ROOT, "data", "history.json")
REPLAY_PATH = os.path.join(REPO_ROOT, "data", "failure_replay.json")

KST = datetime.timezone(datetime.timedelta(hours=9), name="KST")

# adapter/reading-store.js의 ERROR_CODES와 동일해야 한다.
ERROR_CODES = ("timeout", "auth", "rate_limit", "offline", "schema_error")

FAILURE_TYPES = {
    "timeout": "타임아웃 (느린 외부 응답)",
    "auth": "401/403 (외부 원천 인증 거절)",
    "rate_limit": "429 (외부 원천 호출 제한)",
    "offline": "오프라인 (네트워크 연결 중단)",
    "schema_error": "응답 형식 변경 (필수값 타입 불일치)",
}


class FetchError(Exception):
    def __init__(self, error_code, http_status=None, detail="", retry_after_seconds=None):
        assert error_code in ERROR_CODES, f"invalid error_code: {error_code}"
        super().__init__(detail or error_code)
        self.error_code = error_code
        self.http_status = http_status
        self.detail = detail
        self.retry_after_seconds = retry_after_seconds


def now_kst():
    return datetime.datetime.now(tz=KST)


def today_kst_str():
    return now_kst().date().isoformat()


def kst_date_of(iso_string):
    dt = datetime.datetime.fromisoformat(iso_string)
    return dt.astimezone(KST).date().isoformat()


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


# ---------------------------------------------------------------------------
# 저장 상태기계 — adapter/reading-store.js의 resetEvaluationState / applySuccessfulReading /
# applyError와 같은 모양을 유지한다 (런타임은 공유하지 않지만 상태 모델과 전이 규칙은 동일).
# ---------------------------------------------------------------------------

def reset_state():
    return {
        "schema_version": "aleph-t04-evaluation-state-v1",
        "signal_id": SIGNAL_ID,
        "unit": UNIT,
        "unit_label_ko": UNIT_LABEL_KO,
        "source_name": SOURCE_NAME,
        "source_url": API_URL,
        "reference_timezone": REFERENCE_TZ_LABEL,
        "daily_readings": [],
        "status": None,
        "last_delta": None,
        "last_run": None,
    }


def record_id_for(reading):
    return f"{reading['signal_id']}-{reading['record_date']}"


def comparison_delta(rows, current):
    previous = [
        r for r in rows
        if r["signal_id"] == current["signal_id"] and r["record_date"] < current["record_date"]
    ]
    if not previous:
        return None
    previous.sort(key=lambda r: r["record_date"], reverse=True)
    prev = previous[0]
    if prev["unit"] != current["unit"]:
        return None
    return round(current["normalized_value"] - prev["normalized_value"], 2)


def apply_successful_reading(state, reading, raw_response):
    """reading은 normalized-reading.schema.json과 정확히 같은 9개 키를 가져야 한다."""
    state = copy.deepcopy(state)
    rows = state["daily_readings"]
    existing_idx = next(
        (i for i, r in enumerate(rows)
         if r["signal_id"] == reading["signal_id"] and r["record_date"] == reading["record_date"]),
        None,
    )
    existing = rows[existing_idx] if existing_idx is not None else None
    row = {
        "record_id": existing["record_id"] if existing else record_id_for(reading),
        "signal_id": reading["signal_id"],
        "record_date": reading["record_date"],
        "normalized_value": reading["normalized_value"],
        "unit": reading["unit"],
        "first_fetched_at": existing["first_fetched_at"] if existing else reading["fetched_at"],
        "last_fetched_at": reading["fetched_at"],
        "reading": dict(reading),
        "raw_response": raw_response,
    }
    if existing_idx is not None:
        rows[existing_idx] = row
    else:
        rows.append(row)
    rows.sort(key=lambda r: r["record_date"])

    state["status"] = {"freshness": "fresh", "error_code": "none"}
    state["last_delta"] = comparison_delta(rows, row)
    state["last_run"] = {
        "outcome": "success",
        "error_code": "none",
        "http_status": 200,
        "fetched_at": reading["fetched_at"],
        "detail": None,
        "retry_after_seconds": None,
    }
    return state


def apply_error(state, error_code, fetched_at, http_status=None, detail="", retry_after_seconds=None):
    assert error_code in ERROR_CODES
    state = copy.deepcopy(state)
    state["status"] = {"freshness": "stale", "error_code": error_code}
    state["last_run"] = {
        "outcome": "error",
        "error_code": error_code,
        "http_status": http_status,
        "fetched_at": fetched_at,
        "detail": detail,
        "retry_after_seconds": retry_after_seconds,
    }
    # daily_readings는 절대 건드리지 않는다 — 마지막 정상값이 실패로 지워지지 않는 이유(T04-C17).
    return state


# ---------------------------------------------------------------------------
# 1단계: 원문(raw bytes) 확보 — 실제 호출 또는 시뮬레이션
# ---------------------------------------------------------------------------

def fetch_real_bytes():
    req = urllib.request.Request(API_URL, headers={"User-Agent": "today-fx-board/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        headers = dict(e.headers or {})
        if e.code in (401, 403):
            raise FetchError("auth", http_status=e.code, detail=f"HTTP {e.code}") from e
        if e.code == 429:
            retry_after = headers.get("Retry-After")
            raise FetchError(
                "rate_limit", http_status=e.code, detail=f"HTTP {e.code}",
                retry_after_seconds=int(retry_after) if retry_after and retry_after.isdigit() else None,
            ) from e
        # 그 외 예상 밖의 HTTP 상태(404/500 등)는 "계약대로 응답하지 않음"으로 취급한다
        # (adapter/reading-store.js의 runFixture 기본 분기와 동일한 처리).
        raise FetchError("schema_error", http_status=e.code, detail=f"unexpected HTTP {e.code}") from e
    except TimeoutError as e:
        raise FetchError("timeout", detail="request timed out") from e
    except urllib.error.URLError as e:
        if isinstance(e.reason, TimeoutError) or "timed out" in str(e.reason).lower():
            raise FetchError("timeout", detail=str(e.reason)) from e
        # DNS 실패, 연결 거부 등 — 오프라인으로 취급
        raise FetchError("offline", detail=str(e.reason)) from e


def simulate_bytes(error_code):
    """실제 fetch_real_bytes()와 동일한 (status, raw_bytes, headers) 형태를 반환하거나
    동일한 FetchError를 발생시켜, 이후 파싱/저장 로직이 진짜 실패와 100% 같은 경로를 타게 한다."""
    if error_code == "timeout":
        raise FetchError("timeout", detail="[simulated] request timed out after 8s")
    if error_code == "auth":
        raise FetchError("auth", http_status=401, detail="[simulated] HTTP 401 Unauthorized")
    if error_code == "rate_limit":
        raise FetchError("rate_limit", http_status=429, detail="[simulated] HTTP 429 Too Many Requests",
                          retry_after_seconds=60)
    if error_code == "offline":
        raise FetchError("offline", detail="[simulated] network unreachable")
    if error_code == "schema_error":
        # HTTP 200이지만 normalized_value 타입이 문자열로 바뀐 응답(공식 schema-break.json과 동일한 결)
        body = {
            "result": "success", "base_code": "JPY",
            "time_last_update_utc": "Tue, 15 Sep 2026 00:02:31 +0000",
            "rates": {"KRW": "8.717681"},
        }
        return 200, json.dumps(body).encode("utf-8"), {}
    raise ValueError(f"unknown error_code: {error_code}")


# ---------------------------------------------------------------------------
# 2단계: 파싱 — 실제/시뮬레이션 공통 경로. 성공 시 normalized-reading 9개 키를 만든다.
# ---------------------------------------------------------------------------

def parse_to_reading(raw_bytes, fetched_at_iso):
    try:
        payload = json.loads(raw_bytes)
    except json.JSONDecodeError as e:
        raise FetchError("schema_error", detail=f"JSON decode failed: {e}") from e

    if not isinstance(payload, dict):
        raise FetchError("schema_error", detail="top-level JSON is not an object")
    if payload.get("result") != "success":
        raise FetchError(
            "schema_error",
            detail=f"API가 result=success를 반환하지 않음 (result={payload.get('result')!r})",
        )

    rates = payload.get("rates")
    rate = rates.get("KRW") if isinstance(rates, dict) else None
    source_time_raw = payload.get("time_last_update_utc")
    if rate is None or source_time_raw is None:
        raise FetchError("schema_error", detail="response missing rates.KRW or time_last_update_utc")
    if not isinstance(rate, (int, float)):
        raise FetchError("schema_error", detail=f"rates.KRW must be numeric, got {rate!r}")

    try:
        source_dt = email.utils.parsedate_to_datetime(source_time_raw)
        if source_dt.tzinfo is None:
            source_dt = source_dt.replace(tzinfo=datetime.timezone.utc)
    except (TypeError, ValueError) as e:
        raise FetchError("schema_error", detail=f"time_last_update_utc 파싱 실패: {e}") from e

    record_date = kst_date_of(fetched_at_iso)
    reading = {
        "signal_id": SIGNAL_ID,
        "normalized_value": round(float(rate) * 100, 2),  # 100엔당 원화로 정규화
        "unit": UNIT,
        "source_name": SOURCE_NAME,
        "source_url": API_URL,
        "source_time": source_dt.astimezone(KST).isoformat(),
        "fetched_at": fetched_at_iso,
        "record_timezone": "Asia/Seoul",
        "record_date": record_date,
    }
    return reading


# ---------------------------------------------------------------------------
# 3단계: 정상 실행 — data/history.json(=저장 상태) 갱신
# ---------------------------------------------------------------------------

def run_daily_collection():
    state = load_json(HISTORY_PATH, reset_state())
    if "daily_readings" not in state:  # 예전 스키마 파일이면 새 상태로 초기화
        state = reset_state()

    fetched_at = now_kst().isoformat()
    try:
        status_code, raw, headers = fetch_real_bytes()
        reading = parse_to_reading(raw, fetched_at)
        state = apply_successful_reading(state, reading, raw.decode("utf-8", errors="replace"))
        print(f"[OK] {reading['record_date']} {reading['normalized_value']} {UNIT} "
              f"(source_time={reading['source_time']})")
    except FetchError as e:
        state = apply_error(state, e.error_code, fetched_at, http_status=e.http_status,
                             detail=e.detail, retry_after_seconds=e.retry_after_seconds)
        print(f"[FAILED] error_code={e.error_code} detail={e.detail}")

    save_json(HISTORY_PATH, state)
    return state


# ---------------------------------------------------------------------------
# 4단계: 실패 재생 — data/failure_replay.json 갱신 (일별 기록과 분리, 합성 시험값만 사용)
# ---------------------------------------------------------------------------

def run_failure_replay(error_code):
    if error_code not in FAILURE_TYPES:
        raise SystemExit(f"unknown --simulate value: {error_code} (choices: {list(FAILURE_TYPES)})")

    replay_doc = load_json(
        REPLAY_PATH,
        {
            "note": (
                "이 파일은 실제 장애가 아니라, adapter/reading-store.js와 같은 상태 모델로 5가지 "
                "외부 실패 유형을 정직하게 처리하는지 검증하기 위해 의도적으로 재생(synthetic "
                "replay)한 기록입니다. 모든 값은 합성 시험값이며(T04-C26), 실제 일별 기록(history.json)"
                "과는 분리되어 있습니다."
            ),
            "replays": {},
        },
    )
    replays = replay_doc.setdefault("replays", {})

    # 재생 전용 임시 상태: reset → 정상 두 번(가상 D1-A/D1-B에 해당) → 실패 fixture 재생
    baseline = reset_state()
    fetched_at_a = "2026-09-16T00:10:00+09:00"
    reading_a = {
        "signal_id": SIGNAL_ID, "normalized_value": 860.0, "unit": UNIT,
        "source_name": SOURCE_NAME, "source_url": API_URL,
        "source_time": "2026-09-15T23:58:00+09:00", "fetched_at": fetched_at_a,
        "record_timezone": "Asia/Seoul", "record_date": "2026-09-16",
    }
    baseline = apply_successful_reading(baseline, reading_a, raw_response=None)

    replayed_at = now_kst().isoformat()
    try:
        status_code, raw, headers = simulate_bytes(error_code)
        reading = parse_to_reading(raw, replayed_at)
        after = apply_successful_reading(baseline, reading, raw.decode("utf-8", errors="replace"))
    except FetchError as e:
        after = apply_error(baseline, e.error_code, replayed_at, http_status=e.http_status,
                             detail=e.detail, retry_after_seconds=e.retry_after_seconds)

    last_good = baseline["daily_readings"][-1] if baseline["daily_readings"] else None
    user_facing = build_user_message(after["status"], last_good)

    replays[error_code] = {
        "error_code": error_code,
        "label_ko": FAILURE_TYPES[error_code],
        "replayed_at": replayed_at,
        "status": after["status"],
        "last_run": after["last_run"],
        "row_count_after": len(after["daily_readings"]),
        "last_known_good": {
            "record_date": last_good["record_date"],
            "normalized_value": last_good["normalized_value"],
        } if last_good else None,
        "user_facing_message": user_facing,
    }
    replay_doc["updated_at"] = replayed_at
    save_json(REPLAY_PATH, replay_doc)
    print(f"[REPLAY:{error_code}] {json.dumps(replays[error_code], ensure_ascii=False)}")
    return replays[error_code]


def build_user_message(status, last_good):
    if status["freshness"] == "fresh":
        return "정상 수신"
    reason_ko = {
        "timeout": "데이터 소스 응답 시간 초과",
        "auth": "데이터 소스가 인증을 거절함(401/403)",
        "rate_limit": "데이터 소스 호출 제한(429)",
        "offline": "네트워크 연결 중단",
        "schema_error": "응답 형식이 계약과 달라 해석 불가",
    }.get(status["error_code"], status["error_code"])
    if last_good:
        return (f"오늘자 데이터를 가져오지 못했습니다 ({reason_ko}). 마지막 정상값 "
                f"{last_good['normalized_value']} ({last_good['record_date']} 기준, 오래됨 표시)을 유지합니다.")
    return f"오늘자 데이터를 가져오지 못했습니다 ({reason_ko}). 보존된 이전 정상값이 아직 없습니다."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--simulate",
        choices=sorted(FAILURE_TYPES),
        default=None,
        help="지정하면 실제 API를 호출하지 않고 해당 실패를 재현해 failure_replay.json에 기록한다",
    )
    args = parser.parse_args()

    if args.simulate:
        run_failure_replay(args.simulate)
    else:
        run_daily_collection()


if __name__ == "__main__":
    main()

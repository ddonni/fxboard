#!/usr/bin/env python3
"""
오늘의 진짜 정보판 — 엔화/원(JPY→KRW) 환율 수집기 (카드 1)

- 정상 실행: open.er-api.com 공개 API(무료, API 키 불필요)에서 JPY 기준 환율을 가져와
  data/history.json에 KST 날짜별로 1건씩 기록한다. 같은 날 재실행하면 그날 항목을
  덮어써 멱등적으로 동작한다.
- 실패 시뮬레이션(--simulate): 실제 네트워크를 타지 않고 5가지 외부 실패 유형 중 하나를
  인위적으로 재현해서, 정상 실행과 "완전히 동일한" 파싱/에러 처리 경로를 통과시킨다.
  그 결과는 data/history.json이 아니라 data/failure_replay.json에 기록되어
  실제 일별 기록과 절대 섞이지 않는다. (T04-C26: 합성 시험값만 사용)

카드 1 요구사항 매핑:
  - 값/단위/출처/출처시각/조회시각/기준시간대 → 정상 기록 1건에 전부 저장해서
    프론트엔드(app.js)가 그대로 화면에 보여준다.
  - 원자료·저장값·화면값 일치(T04-C10) → API가 돌려준 원문 텍스트를 raw_response에
    그대로 저장해서, "저장값"이 "원자료"에서 코드로 파생됐음을 그대로 증명한다.

표준 라이브러리만 사용한다 (외부 의존성 없음 → 설치 실패라는 여섯 번째 "실패 유형"을
만들지 않기 위함).
"""
import argparse
import datetime
import email.utils
import json
import os
import urllib.error
import urllib.request

# JPY를 기준통화로 조회 → rates.KRW = "1 JPY가 몇 KRW인가"
API_URL = "https://open.er-api.com/v6/latest/JPY"
PAIR = "JPY/KRW"
UNIT_LABEL = "KRW / 100 JPY (100엔당 원)"
SOURCE_NAME = "ExchangeRate-API (open.er-api.com)"
REFERENCE_TZ_LABEL = "Asia/Seoul (KST, UTC+9)"
TIMEOUT_SECONDS = 8

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_PATH = os.path.join(REPO_ROOT, "data", "history.json")
REPLAY_PATH = os.path.join(REPO_ROOT, "data", "failure_replay.json")

KST = datetime.timezone(datetime.timedelta(hours=9), name="KST")

FAILURE_TYPES = {
    "timeout": "타임아웃",
    "http_4xx": "4xx 클라이언트 오류",
    "http_5xx": "5xx 서버 오류",
    "malformed": "응답 형식 오류(파싱 실패)",
    "empty": "빈 응답/데이터 누락",
}


class FetchError(Exception):
    """네트워크/HTTP/파싱 단계에서 발생한 실패. reason, http_status를 가진다."""

    def __init__(self, reason, http_status=None, detail=""):
        super().__init__(detail or reason)
        self.reason = reason
        self.http_status = http_status
        self.detail = detail


def now_kst():
    return datetime.datetime.now(tz=KST)


def today_kst_str():
    return now_kst().date().isoformat()


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
# 1단계: 원문(raw bytes) 확보 — 실제 호출 또는 시뮬레이션
# ---------------------------------------------------------------------------

def fetch_real_bytes():
    req = urllib.request.Request(API_URL, headers={"User-Agent": "today-fx-board/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        raise FetchError(
            "http_4xx" if 400 <= e.code < 500 else "http_5xx",
            http_status=e.code,
            detail=f"HTTP {e.code}",
        ) from e
    except TimeoutError as e:
        raise FetchError("timeout", detail="request timed out") from e
    except urllib.error.URLError as e:
        # DNS 실패, 연결 거부, 타임아웃 등이 여기로도 들어온다
        if isinstance(e.reason, TimeoutError) or "timed out" in str(e.reason).lower():
            raise FetchError("timeout", detail=str(e.reason)) from e
        raise FetchError("network_error", detail=str(e.reason)) from e


def simulate_bytes(failure_type):
    """실제 fetch_real_bytes()와 동일한 (status, raw_bytes) 형태를 반환하거나
    동일한 FetchError를 발생시켜, 이후 파싱/기록 로직이 진짜 실패와 100% 같은 경로를 타게 한다."""
    if failure_type == "timeout":
        raise FetchError("timeout", detail="[simulated] request timed out after 8s")
    if failure_type == "http_4xx":
        raise FetchError("http_4xx", http_status=404, detail="[simulated] HTTP 404 Not Found")
    if failure_type == "http_5xx":
        raise FetchError("http_5xx", http_status=503, detail="[simulated] HTTP 503 Service Unavailable")
    if failure_type == "malformed":
        # 유효하지 않은 JSON — 응답이 중간에 잘려 들어온 상황을 재현
        return 200, b'{"result":"success","base_code":"JPY","time_last_update_utc":"Tue, 1'
    if failure_type == "empty":
        # 문법적으로는 유효한 JSON이지만 우리가 필요한 필드가 없는 상황(실제 API가
        # 종종 result:"error"로 응답하는 경우까지 포함해서 재현)
        return 200, b'{"result":"error","error-type":"unsupported-code"}'
    raise ValueError(f"unknown failure_type: {failure_type}")


# ---------------------------------------------------------------------------
# 2단계: 파싱 — 실제/시뮬레이션 공통 경로
# ---------------------------------------------------------------------------

def parse_payload(raw_bytes):
    """raw_bytes(API 원문)를 파싱해서 (rate_per_jpy, source_time_utc_raw, source_time_kst_iso)를 반환한다.
    실패 시 FetchError(reason 중 malformed_response 또는 empty_data)를 던진다."""
    try:
        payload = json.loads(raw_bytes)
    except json.JSONDecodeError as e:
        raise FetchError("malformed_response", detail=f"JSON decode failed: {e}") from e

    if not isinstance(payload, dict):
        raise FetchError("malformed_response", detail="top-level JSON is not an object")

    if payload.get("result") != "success":
        raise FetchError(
            "empty_data",
            detail=f"API가 result=success를 반환하지 않음 (result={payload.get('result')!r}, "
                   f"error-type={payload.get('error-type')!r})",
        )

    rates = payload.get("rates")
    rate = rates.get("KRW") if isinstance(rates, dict) else None
    source_time_raw = payload.get("time_last_update_utc")

    if rate is None or source_time_raw is None:
        raise FetchError("empty_data", detail="response missing rates.KRW or time_last_update_utc")
    if not isinstance(rate, (int, float)):
        raise FetchError("malformed_response", detail=f"rates.KRW is not numeric: {rate!r}")

    try:
        source_dt = email.utils.parsedate_to_datetime(source_time_raw)
        if source_dt.tzinfo is None:
            source_dt = source_dt.replace(tzinfo=datetime.timezone.utc)
    except (TypeError, ValueError) as e:
        raise FetchError("malformed_response", detail=f"time_last_update_utc 파싱 실패: {e}") from e

    return float(rate), source_time_raw, source_dt.astimezone(KST).isoformat()


# ---------------------------------------------------------------------------
# 3단계: 정상 실행 — data/history.json 갱신
# ---------------------------------------------------------------------------

def find_last_known_good(records):
    for rec in reversed(records):
        if rec.get("status") == "ok":
            return {
                "date": rec["date"],
                "rate_per_jpy": rec["rate_per_jpy"],
                "rate_per_100jpy": rec["rate_per_100jpy"],
                "source_time_kst": rec.get("source_time_kst"),
            }
    return None


def upsert_today(records, new_record):
    today = new_record["date"]
    for i, rec in enumerate(records):
        if rec["date"] == today:
            records[i] = new_record
            return records
    records.append(new_record)
    records.sort(key=lambda r: r["date"])
    return records


def run_daily_collection():
    history = load_json(
        HISTORY_PATH,
        {"pair": PAIR, "unit": UNIT_LABEL, "source": API_URL, "source_name": SOURCE_NAME,
         "reference_timezone": REFERENCE_TZ_LABEL, "records": []},
    )
    records = history.setdefault("records", [])
    today = today_kst_str()
    fetched_at = now_kst().isoformat()

    try:
        status_code, raw = fetch_real_bytes()
        rate_per_jpy, source_time_utc_raw, source_time_kst = parse_payload(raw)
        record = {
            "date": today,
            "status": "ok",
            "rate_per_jpy": rate_per_jpy,
            "rate_per_100jpy": round(rate_per_jpy * 100, 2),
            "unit": UNIT_LABEL,
            "source_time_utc": source_time_utc_raw,
            "source_time_kst": source_time_kst,
            "fetched_at": fetched_at,
            "reference_timezone": REFERENCE_TZ_LABEL,
            "reason": None,
            "http_status": status_code,
            "last_known_good": None,
            "raw_response": raw.decode("utf-8", errors="replace"),
        }
        print(f"[OK] {today} {PAIR} = {record['rate_per_100jpy']} {UNIT_LABEL} "
              f"(source_time={source_time_kst})")
    except FetchError as e:
        lkg = find_last_known_good(records)
        record = {
            "date": today,
            "status": "failed",
            "rate_per_jpy": None,
            "rate_per_100jpy": None,
            "unit": UNIT_LABEL,
            "source_time_utc": None,
            "source_time_kst": None,
            "fetched_at": fetched_at,
            "reference_timezone": REFERENCE_TZ_LABEL,
            "reason": e.reason,
            "http_status": e.http_status,
            "detail": e.detail,
            "last_known_good": lkg,
            "raw_response": None,
        }
        print(f"[FAILED] {today} reason={e.reason} detail={e.detail} last_known_good={lkg}")

    history["records"] = upsert_today(records, record)
    history["updated_at"] = fetched_at
    save_json(HISTORY_PATH, history)
    return record


# ---------------------------------------------------------------------------
# 4단계: 실패 재생 — data/failure_replay.json 갱신 (일별 기록과 분리)
# ---------------------------------------------------------------------------

def run_failure_replay(failure_type):
    if failure_type not in FAILURE_TYPES:
        raise SystemExit(f"unknown --simulate value: {failure_type} (choices: {list(FAILURE_TYPES)})")

    replay_doc = load_json(
        REPLAY_PATH,
        {
            "note": (
                "이 파일은 실제 장애가 아니라, 파이프라인이 5가지 외부 실패 유형을 "
                "정직하게 처리하는지 검증하기 위해 의도적으로 재생(synthetic replay)한 기록입니다. "
                "모든 값은 합성 시험값이며, 실제 일별 환율 기록(history.json)과는 분리되어 있습니다."
            ),
            "replays": {},
        },
    )
    replays = replay_doc.setdefault("replays", {})

    # data/history.json에서 last_known_good을 참고용으로만 가져온다 (기록을 건드리지 않음)
    history = load_json(HISTORY_PATH, {"records": []})
    lkg = find_last_known_good(history.get("records", []))

    replayed_at = now_kst().isoformat()
    try:
        status_code, raw = simulate_bytes(failure_type)
        rate_per_jpy, source_time_utc_raw, source_time_kst = parse_payload(raw)
        outcome = {
            "resulting_status": "ok",
            "resulting_reason": None,
            "rate_per_100jpy": round(rate_per_jpy * 100, 2),
        }
    except FetchError as e:
        outcome = {
            "resulting_status": "failed",
            "resulting_reason": e.reason,
            "http_status": e.http_status,
            "detail": e.detail,
        }

    user_facing = build_user_message(outcome, lkg)

    replays[failure_type] = {
        "failure_type": failure_type,
        "label_ko": FAILURE_TYPES[failure_type],
        "replayed_at": replayed_at,
        **outcome,
        "last_known_good_used": lkg,
        "user_facing_message": user_facing,
    }
    replay_doc["updated_at"] = replayed_at
    save_json(REPLAY_PATH, replay_doc)
    print(f"[REPLAY:{failure_type}] {json.dumps(replays[failure_type], ensure_ascii=False)}")
    return replays[failure_type]


def build_user_message(outcome, lkg):
    if outcome["resulting_status"] == "ok":
        return f"100엔당 {outcome['rate_per_100jpy']}원 (정상 수신)"
    reason = outcome["resulting_reason"]
    reason_ko = {
        "timeout": "데이터 소스 응답 시간 초과",
        "http_4xx": "데이터 소스가 요청을 거부함",
        "http_5xx": "데이터 소스 서버 오류",
        "malformed_response": "응답 형식이 손상되어 해석 불가",
        "empty_data": "응답에 값이 비어 있음",
    }.get(reason, reason)
    if lkg:
        return (f"오늘자 데이터를 가져오지 못했습니다 ({reason_ko}). "
                f"마지막 정상값 100엔당 {lkg['rate_per_100jpy']}원 ({lkg['date']} 기준)을 유지합니다.")
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

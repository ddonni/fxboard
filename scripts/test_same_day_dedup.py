#!/usr/bin/env python3
"""
오늘의 진짜 정보판 — 하루 한 줄 검증기 (카드 4, T04-C20 / T04-C21)

이 스크립트는 실제 네트워크나 data/history.json을 전혀 건드리지 않는다. 대신
collect_rate.py가 실제로 쓰는 함수(parse_to_reading, apply_successful_reading)를
그대로 불러와서, "합성 시계(synthetic clock)"로 만든 4번의 가상 성공 수신을 순서대로
먹인다:

  A) 2026-09-16 00:10 KST — 같은 날 1번째 성공
  B) 2026-09-16 09:00 KST — 같은 날 2번째 성공 (재실행)
  C) 2026-09-16 23:55 KST — 같은 날 3번째 성공 (재실행)
  D) 2026-09-17 00:15 KST — 다음 날 1번째 성공

collect_rate.py의 일별 고유키는 record_id_for() = f"{signal_id}-{record_date}"이고,
record_date는 fetched_at을 기준 시간대(Asia/Seoul)로 환산한 날짜다. apply_successful_reading()은
이 키가 이미 daily_readings에 있으면 그 행을 덮어쓰고(같은 record_id 유지, 값만 최신화),
없으면 새 행을 추가한다.

기대 결과:
  - A 이후: daily_readings 1건
  - B, C 이후(같은 날 재실행): 계속 1건, 그러나 저장된 값은 매번 최신 값으로 갱신됨
    (T04-C20 — 같은 날짜에 여러 번 성공해도 일별 기록은 한 건)
  - D 이후(다음 날): daily_readings 2건으로 증가
    (T04-C21 — 다음 날짜에 성공하면 새 일별 기록이 생김)

실패하면 exit code 1로 assert가 그대로 터진다(어느 단계에서 몇 건이었는지와 함께).
성공하면 data/same_day_dedup_evidence.json에 단계별 행 수 증거를 남기고 exit code 0.
"""
import copy
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_rate import (  # noqa: E402
    API_URL,
    SIGNAL_ID,
    SOURCE_NAME,
    UNIT,
    apply_successful_reading,
    parse_to_reading,
    reset_state,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVIDENCE_PATH = os.path.join(REPO_ROOT, "data", "same_day_dedup_evidence.json")


def synthetic_bytes(rate_krw, source_time_rfc1123):
    body = {
        "result": "success",
        "base_code": "JPY",
        "time_last_update_utc": source_time_rfc1123,
        "rates": {"KRW": rate_krw},
    }
    return json.dumps(body).encode("utf-8")


# (라벨, KST 조회시각 ISO, 원문 rates.KRW 값, 원문 time_last_update_utc)
MOMENTS = [
    ("A (같은 날 1번째)", "2026-09-16T00:10:00+09:00", 8.60,
     "Tue, 15 Sep 2026 15:08:00 GMT"),
    ("B (같은 날 2번째, 재실행)", "2026-09-16T09:00:00+09:00", 8.65,
     "Tue, 15 Sep 2026 23:58:00 GMT"),
    ("C (같은 날 3번째, 재실행)", "2026-09-16T23:55:00+09:00", 8.70,
     "Wed, 16 Sep 2026 14:50:00 GMT"),
    ("D (다음 날 1번째)", "2026-09-17T00:15:00+09:00", 8.75,
     "Wed, 16 Sep 2026 15:12:00 GMT"),
]


def main():
    state = reset_state()
    steps = []

    for label, fetched_at, rate, source_time_raw in MOMENTS:
        raw = synthetic_bytes(rate, source_time_raw)
        reading = parse_to_reading(raw, fetched_at)
        before_count = len(state["daily_readings"])
        before_ids = [r["record_id"] for r in state["daily_readings"]]

        state = apply_successful_reading(state, reading, raw.decode("utf-8"))

        after_count = len(state["daily_readings"])
        after_ids = [r["record_id"] for r in state["daily_readings"]]
        last_row = state["daily_readings"][-1]

        step = {
            "moment": label,
            "fetched_at": fetched_at,
            "record_date": reading["record_date"],
            "raw_rate_krw": rate,
            "row_count_before": before_count,
            "row_count_after": after_count,
            "record_ids_after": after_ids,
            "stored_value_for_date": last_row["normalized_value"],
            "record_id_for_date": last_row["record_id"],
        }
        steps.append(step)
        print(f"[{label}] fetched_at={fetched_at} record_date={reading['record_date']} "
              f"행수 {before_count} -> {after_count} (저장값 {last_row['normalized_value']})")

    # --- 검증 (T04-C20): A/B/C는 모두 2026-09-16, 매번 같은 record_id를 유지한 채 1건이어야 한다 ---
    a, b, c, d = steps
    assert a["row_count_after"] == 1, f"A 이후 행 수가 1이 아님: {a}"
    assert b["row_count_before"] == 1 and b["row_count_after"] == 1, (
        f"같은 날 재실행(B)인데 행 수가 늘어남(T04-C20 위반): {b}"
    )
    assert c["row_count_before"] == 1 and c["row_count_after"] == 1, (
        f"같은 날 재실행(C)인데 행 수가 늘어남(T04-C20 위반): {c}"
    )
    assert a["record_id_for_date"] == b["record_id_for_date"] == c["record_id_for_date"], (
        "같은 날짜인데 record_id가 바뀜 — 다른 행으로 취급된 것"
    )
    # 같은 날 재실행마다 "최신값으로 덮어쓰기"가 실제로 일어났는지(그냥 무시된 게 아닌지)도 확인
    assert c["stored_value_for_date"] == 870.0, (
        f"같은 날 3번째 재실행 값이 최신화되지 않음: {c['stored_value_for_date']}"
    )

    # --- 검증 (T04-C21): D는 다음 날짜이므로 새 행이 생겨 2건이 되어야 한다 ---
    assert d["row_count_before"] == 1 and d["row_count_after"] == 2, (
        f"다음 날 성공인데 새 행이 생기지 않음(T04-C21 위반): {d}"
    )
    assert d["record_id_for_date"] != c["record_id_for_date"], (
        "다음 날짜인데 record_id가 전날과 같음"
    )
    assert state["last_delta"] == 5.0, f"다음 날 delta 계산이 틀림: {state['last_delta']}"

    evidence = {
        "note": (
            "이 파일은 실제 수집 기록이 아니라, collect_rate.py의 실제 저장 함수"
            "(apply_successful_reading)를 합성 시계(synthetic clock)로 시험한 결과입니다."
            " data/history.json과는 분리되어 있고, 실제 네트워크도 타지 않습니다"
            " (T04-C20, T04-C21 검증용, 카드 4)."
        ),
        "criteria": {
            "T04-C20": "기준 시간대(Asia/Seoul)의 같은 날짜에 여러 번 성공해도 일별 기록은 한 건이다.",
            "T04-C21": "기준 시간대의 다음 날짜에 성공하면 새 일별 기록이 생긴다.",
        },
        "steps": steps,
        "result": "PASS",
        "verified_at": datetime.datetime.now(
            tz=datetime.timezone(datetime.timedelta(hours=9))
        ).isoformat(),
    }
    os.makedirs(os.path.dirname(EVIDENCE_PATH), exist_ok=True)
    with open(EVIDENCE_PATH, "w", encoding="utf-8") as f:
        json.dump(evidence, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print()
    print("=== 결과: PASS ===")
    print(f"같은 날짜(2026-09-16) 3번 성공 → 행 수: {a['row_count_after']} -> "
          f"{b['row_count_after']} -> {c['row_count_after']} (변화 없음, T04-C20)")
    print(f"다음 날짜(2026-09-17) 성공 → 행 수: {c['row_count_after']} -> "
          f"{d['row_count_after']} (+1, T04-C21)")
    print(f"증거 저장: data/same_day_dedup_evidence.json")


if __name__ == "__main__":
    main()

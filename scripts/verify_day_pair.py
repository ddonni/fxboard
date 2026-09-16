#!/usr/bin/env python3
"""
오늘의 진짜 정보판 — 실제 이틀 대조 검증기 (카드 5, T04-C22 / T04-C23 / T04-C24)

카드 4까지와 달리 이 스크립트는 합성 시계나 시뮬레이션을 쓰지 않는다. data/history.json에
실제로 쌓인 정상 수신 기록(=실제 공개 원천을 조회해서 얻은 값)만 읽는다. 조작된 값이나
가짜 날짜를 만들어내지 않으므로, 서로 다른 실제 날짜의 기록이 최소 2건 쌓이기 전까지는
"아직 부족함"을 정직하게 보고하고 끝난다 (exit code 2) — 이것도 assignment 지침
("기록을 조작하지 않음 → 다른 과제를 진행 → 다음 실제 날짜에 다시 확인")을 그대로 따른 것.

2건 이상이면 시간순으로 가장 이른 두 건(첫날, 다른 날)을 골라:
  - T04-C22: 두 기록의 record_date(Asia/Seoul 기준)가 서로 다른지 확인
  - T04-C23: 각 기록의 reading.source_url / reading.source_time / normalized_value / unit이
    저장된 일별 행(row)의 값과 정확히 일치하는지 확인 (row가 곧 화면에 표시되는 값이므로,
    이 일치는 "저장값 = 화면값"의 근거가 된다 — app.js의 renderHistoryTable/renderDayPairSection이
    같은 row 필드를 그대로 읽어서 그린다)
  - T04-C24: app.js와는 별개로, 이 스크립트 자신의 코드로 delta = 둘째 날 값 - 첫째 날 값을
    다시 계산해서, (기록이 정확히 2건일 때는) collect_rate.py가 저장해둔 state.last_delta와
    일치하는지 확인

data/day_pair_evidence.json에 결과를 남긴다.
"""
import argparse
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_HISTORY_PATH = os.path.join(REPO_ROOT, "data", "history.json")
DEFAULT_EVIDENCE_PATH = os.path.join(REPO_ROOT, "data", "day_pair_evidence.json")


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def record_summary(row):
    reading = row["reading"]
    return {
        "record_date": row["record_date"],
        "source_url": reading["source_url"],
        "source_time": reading["source_time"],
        "fetched_at": reading["fetched_at"],
        "normalized_value": row["normalized_value"],
        "unit": row["unit"],
        "record_id": row["record_id"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", default=DEFAULT_HISTORY_PATH, help="검증할 history.json 경로")
    parser.add_argument("--out", default=DEFAULT_EVIDENCE_PATH, help="증거 저장 경로")
    args = parser.parse_args()

    if not os.path.exists(args.path):
        print(f"[PENDING] {args.path} 파일이 없습니다. 배포 후 첫 수집이 아직 실행되지 않았을 수 있습니다.")
        sys.exit(2)

    state = load_json(args.path)
    rows = sorted(state.get("daily_readings", []), key=lambda r: r["record_date"])

    if len(rows) < 2:
        print(f"[PENDING] 실제 정상 수신 기록이 {len(rows)}건입니다 (2건 이상 필요).")
        print("값을 조작하지 않습니다 — 실제 다음 KST 날짜에 자동/수동 수집이 한 번 더 "
              "성공하면 다시 실행하세요 (예: GitHub Actions 'Collect JPY/KRW rate' 워크플로가 "
              "매일 00:10 KST에 자동 실행됩니다).")
        sys.exit(2)

    a, b = rows[0], rows[1]  # 서로 다른 실제 날짜 중 가장 이른 두 건

    problems = []

    # T04-C22: 서로 다른 실제 날짜인지
    if a["record_date"] == b["record_date"]:
        problems.append(f"두 기록의 record_date가 같음: {a['record_date']}")

    # T04-C23: reading(원천 메타데이터)과 row(저장/화면 표시값)가 서로 일치하는지
    for label, row in (("첫째 날", a), ("둘째 날", b)):
        reading = row["reading"]
        if row["normalized_value"] != reading["normalized_value"]:
            problems.append(f"{label}: row.normalized_value({row['normalized_value']}) != "
                             f"reading.normalized_value({reading['normalized_value']})")
        if row["unit"] != reading["unit"]:
            problems.append(f"{label}: row.unit({row['unit']}) != reading.unit({reading['unit']})")
        if not reading.get("source_url"):
            problems.append(f"{label}: source_url이 비어있음")
        if not reading.get("source_time"):
            problems.append(f"{label}: source_time이 비어있음")

    # T04-C24: 독립 재계산 — 이 스크립트 자신의 뺄셈으로 delta를 다시 구한다
    recomputed_delta = round(b["normalized_value"] - a["normalized_value"], 2)
    stored_last_delta = state.get("last_delta")
    matches_stored = None
    if len(rows) == 2:
        matches_stored = (
            stored_last_delta is not None
            and abs(recomputed_delta - stored_last_delta) < 0.005
        )
        if not matches_stored:
            problems.append(
                f"재계산한 delta({recomputed_delta})가 저장된 last_delta({stored_last_delta})와 다름"
            )

    result = "FAIL" if problems else "PASS"

    evidence = {
        "note": (
            "이 파일은 실제 공개 원천(open.er-api.com)을 조회해 얻은 진짜 기록만 사용합니다. "
            "합성값·시뮬레이션 값은 전혀 섞여 있지 않습니다 (T04-C22~C24 검증용, 카드 5)."
        ),
        "total_real_records": len(rows),
        "first_day": record_summary(a),
        "second_day": record_summary(b),
        "recomputed_delta": recomputed_delta,
        "stored_last_delta": stored_last_delta,
        "recomputed_matches_stored_last_delta": matches_stored,
        "problems": problems,
        "result": result,
    }
    save_json(args.out, evidence)

    print(f"[{result}] 첫째 날 {a['record_date']}: {a['normalized_value']} {a['unit']} "
          f"(출처 시각 {a['reading']['source_time']})")
    print(f"[{result}] 둘째 날 {b['record_date']}: {b['normalized_value']} {b['unit']} "
          f"(출처 시각 {b['reading']['source_time']})")
    print(f"재계산한 어제 대비 변화: {recomputed_delta:+.2f}{a['unit'].split('/')[0] if '/' in a['unit'] else ''}")
    if len(rows) == 2:
        print(f"저장된 last_delta와 일치: {matches_stored}")
    else:
        print(f"(참고: 실제 기록이 {len(rows)}건이라 last_delta는 최근 두 건 기준이라 직접 비교는 생략)")
    print(f"증거 저장: {args.out}")

    if problems:
        print("\n문제:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)


if __name__ == "__main__":
    main()

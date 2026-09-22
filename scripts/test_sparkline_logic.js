#!/usr/bin/env node
/*
 * scripts/test_sparkline_logic.js — CHECKS.md #1~#5 실행 스크립트 (과제 5, Session A)
 *
 * sparkline.js의 순수 함수만 테스트한다. DOM·브라우저·네트워크 전혀 사용하지 않는다
 * (Node 내장 기능만 사용 — CHECKS.md 공통 사용 상한의 "외부 네트워크 0회" 준수).
 */
const assert = require("assert");
const path = require("path");
const { computeTrendSeries, buildSparklinePath } = require(path.join(__dirname, "..", "sparkline.js"));

let failures = 0;
function check(id, desc, fn) {
  try {
    fn();
    console.log(`[PASS] #${id} ${desc}`);
  } catch (e) {
    failures++;
    console.log(`[FAIL] #${id} ${desc}\n       ${e.message}`);
  }
}

// #1 — 0건일 때 예외 없이 "데이터 없음" 상태
check(1, "0건일 때 예외 없이 count:0을 반환한다", () => {
  const s = computeTrendSeries([]);
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.trend, null);
  const path_ = buildSparklinePath(s);
  assert.strictEqual(path_, null, "0건이면 경로도 null이어야 함");
});

// #2 — 1건일 때 예외 없이 값 반환
check(2, "1건일 때 예외 없이 점 1개를 반환한다", () => {
  const rows = [{ record_date: "2026-09-16", normalized_value: 860.12 }];
  const s = computeTrendSeries(rows);
  assert.strictEqual(s.count, 1);
  assert.strictEqual(s.trend, "flat");
  const path_ = buildSparklinePath(s);
  assert.ok(path_ && path_.startsWith("M"), "1건이면 M ... L ... 형태의 경로가 나와야 함");
});

// #3 — 8건 이상일 때 정확히 최근 7건만 사용
check(3, "8건 이상이면 최근 7건만 사용한다", () => {
  const rows = [];
  for (let d = 10; d <= 20; d++) {
    rows.push({ record_date: `2026-09-${d}`, normalized_value: 800 + d });
  }
  assert.strictEqual(rows.length, 11, "테스트 전제: 11건 준비");
  const s = computeTrendSeries(rows);
  assert.strictEqual(s.count, 7);
  assert.strictEqual(s.points[0].date, "2026-09-14", "최근 7건의 첫날은 09-14여야 함(09-14~09-20)");
  assert.strictEqual(s.points[6].date, "2026-09-20");
});

// #4 — 반환된 포인트 개수 == 사용한 행 수
check(4, "포인트 개수가 사용한 데이터 행 수와 같다", () => {
  for (const n of [0, 1, 3, 7, 9]) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push({ record_date: `2026-09-${10 + i}`, normalized_value: 800 + i });
    }
    const s = computeTrendSeries(rows);
    const expected = Math.min(n, 7);
    assert.strictEqual(s.count, expected, `n=${n}일 때 count=${expected}이어야 하는데 ${s.count}`);
    assert.strictEqual(s.points.length, expected);
  }
});

// #5 — 상승/하락/횡보 3가지 합성 케이스에서 추세 판정
check(5, "상승/하락/횡보 추세 판정이 올바르다", () => {
  const up = computeTrendSeries([
    { record_date: "2026-09-16", normalized_value: 860.0 },
    { record_date: "2026-09-17", normalized_value: 870.0 },
    { record_date: "2026-09-18", normalized_value: 886.1 },
  ]);
  assert.strictEqual(up.trend, "up", `상승 케이스인데 ${up.trend}`);

  const down = computeTrendSeries([
    { record_date: "2026-09-16", normalized_value: 886.1 },
    { record_date: "2026-09-17", normalized_value: 882.14 },
    { record_date: "2026-09-18", normalized_value: 880.71 },
  ]);
  assert.strictEqual(down.trend, "down", `하락 케이스인데 ${down.trend}`);

  const flat = computeTrendSeries([
    { record_date: "2026-09-16", normalized_value: 880.0 },
    { record_date: "2026-09-17", normalized_value: 880.001 },
    { record_date: "2026-09-18", normalized_value: 880.0 },
  ]);
  assert.strictEqual(flat.trend, "flat", `횡보 케이스인데 ${flat.trend}`);
});

console.log("");
if (failures > 0) {
  console.log(`=== 결과: ${failures}건 실패 ===`);
  process.exit(1);
} else {
  console.log("=== 결과: 모두 PASS (#1~#5) ===");
  process.exit(0);
}

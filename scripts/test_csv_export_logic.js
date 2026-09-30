#!/usr/bin/env node
/*
 * scripts/test_csv_export_logic.js — T05_CARD1.md의 CSV-01~05 실행 스크립트 (과제 5, AI A)
 *
 * csv-export.js의 순수 함수만 테스트한다. DOM·브라우저·네트워크 전혀 사용하지 않는다.
 */
const assert = require("assert");
const path = require("path");
const { rowsToCsv } = require(path.join(__dirname, "..", "csv-export.js"));

let failures = 0;
function check(id, desc, fn) {
  try {
    fn();
    console.log(`[PASS] ${id} ${desc}`);
  } catch (e) {
    failures++;
    console.log(`[FAIL] ${id} ${desc}\n       ${e.message}`);
  }
}

const HEADER = "record_date,normalized_value,source_time_kst,fetched_time_kst";

// CSV-01 — 0행일 때 예외 없이 헤더만 반환
check("CSV-01", "0행일 때 헤더 1줄만 반환한다", () => {
  const out = rowsToCsv([]);
  const lines = out.split("\n");
  assert.strictEqual(lines.length, 1, "정확히 1줄이어야 함");
  assert.strictEqual(lines[0], HEADER);
});

// CSV-02 — 1행일 때 헤더+1행 반환, 값이 원본과 정확히 일치
check("CSV-02", "1행일 때 헤더+1행을 정확한 값으로 반환한다", () => {
  const rows = [
    { record_date: "2026-09-17", normalized_value: 876.93, source_time_kst: "2026-09-16 09:02:00", fetched_time_kst: "2026-09-17 00:10:05" },
  ];
  const out = rowsToCsv(rows);
  const lines = out.split("\n");
  assert.strictEqual(lines.length, 2, "정확히 2줄이어야 함");
  assert.strictEqual(lines[1], "2026-09-17,876.93,2026-09-16 09:02:00,2026-09-17 00:10:05");
});

// CSV-03 — 쉼표 포함 값 이스케이프, 열 개수 유지
check("CSV-03", "쉼표 포함 값을 이스케이프하고 열 개수를 유지한다", () => {
  const rows = [
    { record_date: "2026-09-18", normalized_value: 880.0, source_time_kst: "09:02, KST", fetched_time_kst: "2026-09-18 00:10:05" },
  ];
  const out = rowsToCsv(rows);
  const dataLine = out.split("\n")[1];
  assert.ok(dataLine.includes('"09:02, KST"'), `쉼표 필드가 따옴표로 감싸져야 함: ${dataLine}`);
  // 단순 split(",")로는 따옴표 안 쉼표까지 갈라지지만, 필드 자체가 큰따옴표로 감싸졌는지만 확인
  assert.ok(/^2026-09-18,880,"09:02, KST",2026-09-18 00:10:05$/.test(dataLine), `형식이 예상과 다름: ${dataLine}`);
});

// CSV-04 — 큰따옴표 포함 값 이스케이프
check("CSV-04", "큰따옴표 포함 값을 ''로 이스케이프하고 필드를 따옴표로 감싼다", () => {
  const rows = [
    { record_date: "2026-09-19", normalized_value: 882.0, source_time_kst: '9시 "정각"', fetched_time_kst: "2026-09-19 00:10:05" },
  ];
  const out = rowsToCsv(rows);
  const dataLine = out.split("\n")[1];
  assert.ok(dataLine.includes('"9시 ""정각""\"'), `큰따옴표 이스케이프 형식이 예상과 다름: ${dataLine}`);
});

// CSV-05 — 행 순서 유지(정렬하지 않음)
check("CSV-05", "입력 배열 순서를 그대로 유지한다(정렬하지 않음)", () => {
  const rows = [
    { record_date: "2026-09-19", normalized_value: 1, source_time_kst: "a", fetched_time_kst: "a" },
    { record_date: "2026-09-17", normalized_value: 2, source_time_kst: "b", fetched_time_kst: "b" },
    { record_date: "2026-09-18", normalized_value: 3, source_time_kst: "c", fetched_time_kst: "c" },
  ];
  const out = rowsToCsv(rows);
  const lines = out.split("\n").slice(1);
  assert.deepStrictEqual(
    lines.map((l) => l.split(",")[0]),
    ["2026-09-19", "2026-09-17", "2026-09-18"],
    "입력 순서(09-19→09-17→09-18)가 그대로 유지돼야 함"
  );
});

console.log("");
if (failures > 0) {
  console.log(`=== 결과: ${failures}건 실패 ===`);
  process.exit(1);
} else {
  console.log("=== 결과: 모두 PASS (CSV-01~05) ===");
  process.exit(0);
}

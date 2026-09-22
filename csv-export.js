/*
 * csv-export.js — 과제 5, 카드 1(T05-C01~C07) 재작업, AI A 순수 로직
 *
 * 일별 기록(daily_readings)을 CSV 텍스트로 변환하는 순수 함수만 담는다. DOM/브라우저/
 * 네트워크를 전혀 사용하지 않는다(외부 네트워크 0회 상한 준수). Node(require)와
 * 브라우저(window.CsvExport) 양쪽에서 쓸 수 있도록 sparkline.js와 같은 UMD 패턴을
 * 그대로 재사용한다.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  } else {
    root.CsvExport = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const COLUMNS = ["record_date", "normalized_value", "source_time_kst", "fetched_time_kst"];

  // RFC4180: 값에 쉼표/큰따옴표/개행이 있으면 큰따옴표로 감싸고, 내부 큰따옴표는 ""로 이스케이프.
  function escapeCsvField(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // rows: [{record_date, normalized_value, source_time_kst, fetched_time_kst}, ...]
  // 정렬하지 않는다 — 호출자가 이미 원하는 순서(날짜 오름차순)로 준 배열을 그대로 씀(CSV-05).
  function rowsToCsv(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const lines = [COLUMNS.join(",")];
    for (const row of list) {
      const line = COLUMNS.map((col) => escapeCsvField(row ? row[col] : "")).join(",");
      lines.push(line);
    }
    return lines.join("\n");
  }

  return { rowsToCsv, escapeCsvField, COLUMNS };
});

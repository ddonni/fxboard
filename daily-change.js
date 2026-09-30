/*
 * daily-change.js — "일별 기록"의 전일 대비 변화(100엔당 원)를 계산하는 순수 함수 모듈
 *
 * DOM·네트워크·외부 라이브러리를 전혀 쓰지 않는다. 입력을 받아 새 값을 반환할 뿐이다.
 * 브라우저(<script src="daily-change.js"> → window.DailyChange)와
 * Node(require("./daily-change.js"))에서 모두 쓸 수 있는 UMD 형태 (sparkline.js와 같은 방식).
 *
 * 화면(index.html / app.js)에 표 열을 붙이는 일은 이 파일의 범위가 아니다.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod; // Node
  } else {
    root.DailyChange = mod; // 브라우저
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const UP = "▲"; // ▲
  const DOWN = "▼"; // ▼
  const DASH = "—"; // — (em dash)

  // 소수 둘째 자리로 반올림. 880.30 - 880.10 같은 부동소수점 꼬리(0.20000000000000284)를 없앤다.
  function round2(x) {
    const r = Math.round(x * 100) / 100;
    return r === 0 ? 0 : r; // -0 → 0
  }

  function buildLabel(delta) {
    if (delta === null) return DASH;
    if (delta > 0) return UP + " +" + delta.toFixed(2);
    if (delta < 0) return DOWN + " -" + Math.abs(delta).toFixed(2);
    return "= 0.00";
  }

  /**
   * @param {Array<{record_date: string, normalized_value: number}>} rows
   * @returns {Array<{record_date, value, delta, direction, label}>}
   *   record_date 오름차순의 새 배열. 입력 배열·객체는 바꾸지 않는다.
   */
  function computeDailyChanges(rows) {
    const sorted = (rows || [])
      .map(function (r) { return { record_date: r.record_date, value: r.normalized_value }; })
      .sort(function (a, b) {
        return a.record_date < b.record_date ? -1 : a.record_date > b.record_date ? 1 : 0;
      });

    return sorted.map(function (cur, i) {
      let delta = null;
      let direction = null;
      if (i > 0) {
        delta = round2(cur.value - sorted[i - 1].value);
        direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      }
      return {
        record_date: cur.record_date,
        value: cur.value,
        delta: delta,
        direction: direction,
        label: buildLabel(delta),
      };
    });
  }

  return { computeDailyChanges: computeDailyChanges };
});

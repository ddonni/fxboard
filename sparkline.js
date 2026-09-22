/*
 * sparkline.js — 최근 N일 추이 미니 차트의 순수 계산 로직 (과제 5, Session A 작업분)
 *
 * 이 파일은 의도적으로 DOM을 전혀 건드리지 않는다. computeTrendSeries()/buildSparklinePath()/
 * buildAriaLabel() 모두 입력을 받아 값을 반환하기만 하는 순수 함수라서, 브라우저 없이
 * Node에서 바로 테스트할 수 있다(scripts/test_sparkline_logic.js 참고, CHECKS.md #1~#5).
 *
 * 실제로 <svg>를 페이지에 그려 넣는 일(app.js의 renderTodayCard 통합, aria-label 연결,
 * 다크모드 색상, 기존 섹션 회귀 없음 확인 — CHECKS.md #6~#8)은 여기서 하지 않았다.
 * HANDOFF.md에 이 경계를 명시해뒀다.
 *
 * 브라우저(<script src="sparkline.js">)와 Node(require) 양쪽에서 쓸 수 있도록
 * 아주 단순한 UMD 패턴을 쓴다 — 외부 라이브러리 없음(CHECKS.md #10).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod; // Node (테스트 스크립트용)
  } else {
    root.Sparkline = mod; // 브라우저 (app.js에서 window.Sparkline로 사용 예정)
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_MAX_POINTS = 7;
  const EPSILON = 0.005; // 이 값보다 작은 변화는 "횡보(flat)"로 취급

  /**
   * daily_readings 배열에서 최근 최대 maxPoints건을 골라 추세 계산에 필요한
   * 형태로 정리한다. 입력은 history.json의 state.daily_readings와 같은 모양
   * (각 행에 record_date, normalized_value가 있으면 됨) — row.reading 유무는 상관없다.
   *
   * 반환값:
   *   { count: 0 }                                   — 기록 없음
   *   { count: 1, points, min, max, trend: "flat" }   — 1건뿐 (방향 판정 불가)
   *   { count: N>=2, points, min, max, trend }        — trend는 "up"/"down"/"flat"
   */
  function computeTrendSeries(rows, maxPoints) {
    maxPoints = maxPoints || DEFAULT_MAX_POINTS;
    const safeRows = Array.isArray(rows) ? rows : [];

    if (safeRows.length === 0) {
      return { count: 0, points: [], min: null, max: null, trend: null };
    }

    const sorted = safeRows
      .slice()
      .sort((a, b) => String(a.record_date).localeCompare(String(b.record_date)));
    const recent = sorted.slice(Math.max(0, sorted.length - maxPoints));

    const points = recent.map((r) => ({
      date: r.record_date,
      value: Number(r.normalized_value),
    }));
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    let trend = "flat";
    if (points.length >= 2) {
      const delta = points[points.length - 1].value - points[0].value;
      if (delta > EPSILON) trend = "up";
      else if (delta < -EPSILON) trend = "down";
    }

    return { count: points.length, points, min, max, trend };
  }

  /**
   * computeTrendSeries()의 결과를 받아 <svg><path d="..."></svg>에 쓸 d 문자열을 만든다.
   * width/height/padding만 있으면 되는 순수 좌표 계산 — DOM 없이 문자열만 반환한다.
   * count가 0이면 null을 반환한다(그릴 게 없음). count가 1이면 가운데에 점 하나짜리
   * 경로(M x y L x y, 길이 0)를 반환한다.
   */
  function buildSparklinePath(series, opts) {
    opts = opts || {};
    const width = opts.width || 120;
    const height = opts.height || 28;
    const padding = opts.padding != null ? opts.padding : 2;

    if (!series || series.count === 0) return null;

    const points = series.points;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2;
    const range = series.max - series.min;

    const coords = points.map((p, i) => {
      const x = points.length === 1
        ? padding + innerW / 2
        : padding + (innerW * i) / (points.length - 1);
      const y = range === 0
        ? padding + innerH / 2
        : padding + innerH - ((p.value - series.min) / range) * innerH;
      return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
    });

    if (coords.length === 1) {
      const [x, y] = coords[0];
      return `M ${x} ${y} L ${x} ${y}`;
    }
    return coords.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  }

  /**
   * 스크린리더용 대체 텍스트. 최솟값·최댓값·추세 방향을 사람이 읽는 문장으로 만든다
   * (CHECKS.md #7의 "aria-label 안에 최솟값·최댓값·추세가 포함" 요구를 만족시키는 문구).
   */
  const TREND_LABEL_KO = { up: "상승", down: "하락", flat: "횡보" };

  function buildAriaLabel(series, unitLabel) {
    unitLabel = unitLabel || "";
    if (!series || series.count === 0) {
      return "최근 추이 데이터 없음";
    }
    if (series.count === 1) {
      return `최근 기록 1건 — ${series.points[0].value}${unitLabel} (추세 판정 불가)`;
    }
    const trendKo = TREND_LABEL_KO[series.trend] || series.trend;
    return `최근 ${series.count}일 추이: ${series.min}${unitLabel} ~ ${series.max}${unitLabel}, ${trendKo}`;
  }

  return { computeTrendSeries, buildSparklinePath, buildAriaLabel, DEFAULT_MAX_POINTS };
});

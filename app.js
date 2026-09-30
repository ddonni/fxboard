// 오늘의 진짜 정보판 — 프론트엔드 렌더링 스크립트 (카드 1~3: JPY/KRW)
// 외부 라이브러리 없이 순수 JS(Vanilla JS)로 작성됨.
// data/history.json(=저장 상태), data/failure_replay.json을 fetch로 읽어 화면에 그린다.
//
// history.json의 모양은 adapter/reading-store.js의 resetEvaluationState()가 만드는 상태와
// 같습니다: daily_readings는 "성공한 날짜"만 담고, 실패는 daily_readings를 건드리지 않은 채
// status(freshness/error_code)로만 표시됩니다. 그래서 실패 중에도 daily_readings의 마지막 행이
// 곧 "마지막 정상값"입니다(T04-C17).

// TODO: GitHub에 올린 뒤 실제 저장소 주소로 바꿔주세요.
const SOURCE_URL = "https://github.com/ddonni/fxboard";

const ERROR_LABEL_KO = {
  timeout: "타임아웃 (느린 외부 응답)",
  auth: "인증 거절 (401/403)",
  rate_limit: "호출 제한 (429)",
  offline: "오프라인 (네트워크 연결 중단)",
  schema_error: "응답 형식 변경",
};

const ERROR_REASON_KO = {
  timeout: "데이터 소스 응답 시간 초과",
  auth: "데이터 소스가 인증을 거절함(401/403)",
  rate_limit: "데이터 소스 호출 제한(429)",
  offline: "네트워크 연결 중단",
  schema_error: "응답 형식이 계약과 달라 해석 불가",
};

function fmtNum(v) {
  return v.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      timeZone: "Asia/Seoul",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} 로드 실패 (${res.status})`);
  return res.json();
}

function lastRow(state) {
  const rows = state.daily_readings || [];
  return rows.length ? rows[rows.length - 1] : null;
}

function retryLinkHtml() {
  const actionsUrl = `${SOURCE_URL}/actions/workflows/collect-rate.yml`;
  return `<a class="retry-btn" href="${actionsUrl}" target="_blank" rel="noopener">↻ 다시 시도 (GitHub Actions에서 수동 실행)</a>`;
}

function renderRefTzBanner(state) {
  const el = document.getElementById("ref-tz-banner");
  const tz = state.reference_timezone || "Asia/Seoul (KST, UTC+9)";
  el.textContent = `기준 시간대: ${tz} — 이 페이지의 모든 시각은 KST로 표시됩니다.`;
}

// 과제 5: "오늘" 카드 안에 들어가는 최근 7일 추이 스파크라인(sparkline.js의 순수 로직 사용).
// 기존 카드 본문은 건드리지 않고, 이 함수가 만든 블록을 카드 끝에 "추가"만 한다.
const SPARK_W = 160;
const SPARK_H = 36;
const SPARK_PAD = 4;

function sparklineHtml(state) {
  const S = window.Sparkline;
  if (!S) return ""; // sparkline.js 로드 실패 시에도 기존 카드는 그대로 보이게
  const series = S.computeTrendSeries(state.daily_readings || []);
  const label = S.buildAriaLabel(series, "원");

  if (series.count === 0) {
    return `<div class="sparkline-wrap sparkline-empty">
      <p class="meta-line">최근 추이: 아직 정상 기록이 없어 그래프를 그릴 수 없습니다.</p>
    </div>`;
  }

  const d = S.buildSparklinePath(series, { width: SPARK_W, height: SPARK_H, padding: SPARK_PAD });
  // 마지막(가장 최근) 점 좌표 = path의 마지막 "x y" 쌍
  const nums = d.trim().split(/\s+/);
  const lx = nums[nums.length - 2];
  const ly = nums[nums.length - 1];
  const caption = series.count === 1
    ? "최근 기록 1건 — 추세는 2건 이상 쌓이면 표시됩니다."
    : label;

  return `<div class="sparkline-wrap">
    <svg class="sparkline trend-${series.trend}" width="${SPARK_W}" height="${SPARK_H}"
         viewBox="0 0 ${SPARK_W} ${SPARK_H}" role="img" aria-label="${escapeHtml(label)}">
      <title>${escapeHtml(label)}</title>
      <path class="sparkline-line" d="${d}" fill="none" />
      <circle class="sparkline-dot" cx="${lx}" cy="${ly}" r="2.5" />
    </svg>
    <span class="sparkline-caption" aria-hidden="true">${escapeHtml(caption)}</span>
  </div>`;
}

function renderTodayCard(state) {
  const el = document.getElementById("today-card");
  const unit = state.unit_label_ko || state.unit;
  const last = lastRow(state);

  if (!state.status) {
    el.innerHTML = `
      <div class="status-row"><span class="badge fail">기록 없음</span></div>
      <p class="meta-line">아직 한 번도 수집이 실행되지 않았습니다. 자동 수집은 매일 00:10(KST)에
      GitHub Actions로 실행됩니다. 배포 직후에는 첫 실행 전까지 이 상태가 정상입니다.</p>
      <p class="meta-line">단위(예정): ${unit}</p>
    `;
    return;
  }

  if (state.status.freshness === "fresh") {
    const reading = last.reading;
    el.innerHTML = `
      <div class="status-row">
        <span class="badge ok">정상 수신 (fresh / none)</span>
        <span class="meta-line">기록일 ${last.record_date}</span>
      </div>
      <div class="rate-main">100엔 = ${fmtNum(last.normalized_value)}원</div>
      <div class="unit-line"><strong>단위:</strong> ${unit}</div>
      <div class="source-line"><strong>출처:</strong> <a href="${reading.source_url}" target="_blank" rel="noopener">${escapeHtml(reading.source_name)}</a></div>
      <div class="times-grid">
        <div><strong>출처 시각(KST):</strong> ${fmtDateTime(reading.source_time)}</div>
        <div><strong>조회 시각(KST):</strong> ${fmtDateTime(reading.fetched_at)}</div>
      </div>
      ${state.last_delta !== null && state.last_delta !== undefined
        ? `<p class="delta ${state.last_delta > 0 ? "up" : state.last_delta < 0 ? "down" : "flat"}">
             ${state.last_delta > 0 ? "▲" : state.last_delta < 0 ? "▼" : "＝"}
             ${state.last_delta >= 0 ? "+" : ""}${fmtNum(state.last_delta)}원 (전일 대비)</p>`
        : `<p class="meta-line">비교할 이전 정상 기록이 아직 없습니다.</p>`}
      ${sparklineHtml(state)}
    `;
    return;
  }

  // stale
  const errorCode = state.status.error_code;
  const reasonKo = ERROR_REASON_KO[errorCode] || errorCode;
  const run = state.last_run || {};
  el.innerHTML = `
    <div class="status-row">
      <span class="badge fail">오늘 수집 실패 (stale / ${errorCode})</span>
    </div>
    <div class="unit-line"><strong>단위:</strong> ${unit}</div>
    <div class="source-line"><strong>출처:</strong> <a href="${state.source_url}" target="_blank" rel="noopener">${escapeHtml(state.source_name)}</a></div>
    <div class="fail-explainer">
      데이터 소스에서 값을 가져오지 못했습니다.<br>
      <strong>사유:</strong> ${reasonKo}${run.http_status ? ` (HTTP ${run.http_status})` : ""}${run.retry_after_seconds ? ` · Retry-After ${run.retry_after_seconds}초` : ""}<br>
      <strong>조회 시도 시각(KST):</strong> ${fmtDateTime(run.fetched_at)}
    </div>
    ${last
      ? `<div class="lkg-box">
           <span class="badge stale-tag">오래됨 (stale)</span>
           <strong>마지막 정상값 보존:</strong> 100엔 = ${fmtNum(last.normalized_value)}원
           <span class="meta-line" style="display:inline">(${last.record_date} 기준, 출처 시각 ${fmtDateTime(last.reading.source_time)})</span>
         </div>`
      : `<p class="meta-line">보존된 이전 정상값이 아직 없습니다 (첫 수집부터 실패한 경우).</p>`}
    <p class="retry-row">${retryLinkHtml()}</p>
    ${sparklineHtml(state)}
  `;
}

function renderEvidence(state) {
  const el = document.getElementById("evidence-body");
  const rec = lastRow(state);

  if (!rec) {
    el.innerHTML = `<p class="muted">아직 정상 수신 기록이 없어 증빙을 표시할 수 없습니다. 첫 성공 수집 후 자동으로 채워집니다.</p>`;
    return;
  }

  let rawPretty = "(원문을 표시할 수 없습니다)";
  try {
    const parsed = JSON.parse(rec.raw_response);
    rawPretty = JSON.stringify(parsed, null, 2);
  } catch {
    rawPretty = rec.raw_response || rawPretty;
  }
  let rawHtml = escapeHtml(rawPretty)
    .split("\n")
    .map(line => (/time_last_update_utc|"KRW"/.test(line) ? `<mark>${line}</mark>` : line))
    .join("\n");

  const screenText = `100엔 = ${fmtNum(rec.normalized_value)}원 (출처 시각 ${fmtDateTime(rec.reading.source_time)} KST, 조회 시각 ${fmtDateTime(rec.reading.fetched_at)} KST)`;

  el.innerHTML = `
    <p class="meta-line">대조 대상 기록: ${rec.record_date} (record_id: ${escapeHtml(rec.record_id)})</p>
    <div class="evidence-grid">
      <div class="evidence-col">
        <h3>① 원자료 (API 원문)</h3>
        <pre class="code-block">${rawHtml}</pre>
      </div>
      <div class="evidence-col">
        <h3>② 저장값 (history.json → reading)</h3>
        <pre class="code-block">signal_id: ${rec.signal_id}
normalized_value: ${rec.normalized_value}
unit: ${rec.unit}
source_time: ${escapeHtml(rec.reading.source_time || "-")}
fetched_at: ${escapeHtml(rec.reading.fetched_at || "-")}
record_timezone: ${rec.reading.record_timezone}
record_date: ${rec.record_date}</pre>
      </div>
      <div class="evidence-col">
        <h3>③ 화면값 (위 카드에 표시된 문장)</h3>
        <div class="code-block screen-value">${escapeHtml(screenText)}</div>
        <p class="meta-line">저장값(normalized_value)이 화면에 그대로 표시됩니다 — 별도 환산 없음.</p>
      </div>
    </div>
  `;
}

function renderHistoryTable(state) {
  const tbody = document.getElementById("history-tbody");
  const rows = (state.daily_readings || []).slice().sort((a, b) => b.record_date.localeCompare(a.record_date));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">아직 정상 수신 기록이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.record_date}</td>
      <td class="num">${fmtNum(r.normalized_value)}</td>
      <td>${fmtDateTime(r.reading.source_time)}</td>
      <td>${fmtDateTime(r.reading.fetched_at)}</td>
      <td class="num change-cell"></td>
    </tr>
  `).join("");

  // 전일 대비 열 (과제5 최종, AI B): daily-change.js 결과를 날짜로 찾아 label을 그대로 넣는다.
  // 표는 날짜 내림차순이지만 계산은 오름차순 기준이므로 record_date로 매칭한다.
  const dc = window.DailyChange;
  const byDate = {};
  if (dc && typeof dc.computeDailyChanges === "function") {
    dc.computeDailyChanges(state.daily_readings || []).forEach(c => { byDate[c.record_date] = c; });
  }
  const cells = tbody.querySelectorAll("td.change-cell");
  rows.forEach((r, i) => {
    const c = byDate[r.record_date];
    const td = cells[i];
    if (!td) return;
    td.textContent = c ? c.label : "";
    if (c && c.direction) td.classList.add("change-" + c.direction);
  });
}

// ── CSV 다운로드 (과제5 카드1, AI B) ─────────────────────────────────────
// 주의: data/history.json의 daily_readings 행에는 source_time_kst/fetched_time_kst 키가
// 없고 reading.source_time / reading.fetched_at(ISO, +09:00)만 있다. 그래서 csv-export.js의
// 4개 컬럼 계약에 맞게 투영(projection)만 하고, 정렬은 하지 않는다(저장 순서 = 날짜 오름차순).
function fmtKstPlain(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  // sv-SE 로캘은 "YYYY-MM-DD HH:MM:SS" 형식을 준다 — CSV-02 기대 형식과 동일
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false });
}

function toCsvRows(dailyReadings) {
  return (dailyReadings || []).map(r => ({
    record_date: r.record_date,
    normalized_value: r.normalized_value,
    source_time_kst: fmtKstPlain(r.reading && r.reading.source_time),
    fetched_time_kst: fmtKstPlain(r.reading && r.reading.fetched_at),
  }));
}

function renderCsvButton(state) {
  const btn = document.getElementById("csv-download-btn");
  if (!btn || !window.CsvExport) return;
  const rows = toCsvRows(state.daily_readings);
  const csv = window.CsvExport.rowsToCsv(rows);
  window.FxBoardCsv = { rows, csv }; // 검사(CSV-07)용 노출 — 읽기 전용 용도
  if (rows.length === 0) {
    btn.disabled = true;
    btn.title = "내보낼 정상 수신 기록이 없습니다";
    return;
  }
  btn.disabled = false;
  btn.addEventListener("click", () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fx-board-daily-${rows[0].record_date}_${rows[rows.length - 1].record_date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
}

function renderDayPairSection(state) {
  const el = document.getElementById("day-pair-body");
  const rows = (state.daily_readings || []).slice().sort((a, b) => a.record_date.localeCompare(b.record_date));

  if (rows.length < 2) {
    el.innerHTML = `<p class="muted">아직 서로 다른 실제 날짜의 정상 수신 기록이 2건 미만입니다 (현재 ${rows.length}건). 값을 조작하지 않고, 다음 실제 날짜에 자동 수집이 한 번 더 성공하면 이 섹션이 자동으로 채워집니다.</p>`;
    return;
  }

  // 가장 최근 인접한 두 건(어제, 오늘) — collect_rate.py가 last_delta를 계산할 때 쓰는
  // 짝과 항상 같으므로, 위 오늘 카드의 "전일 대비" 표시값과 바로 대조할 수 있다.
  const a = rows[rows.length - 2];
  const b = rows[rows.length - 1];
  const recomputed = Math.round((b.normalized_value - a.normalized_value) * 100) / 100;
  const matchesDisplayed = state.last_delta !== null && state.last_delta !== undefined
    ? Math.abs(recomputed - state.last_delta) < 0.005
    : null;

  const recordBlock = (label, rec) => `
    <div class="evidence-col">
      <h3>${label} — ${rec.record_date}</h3>
      <pre class="code-block">출처 URL: ${escapeHtml(rec.reading.source_url)}
출처 시각(KST): ${fmtDateTime(rec.reading.source_time)}
조회 시각(KST): ${fmtDateTime(rec.reading.fetched_at)}
값(저장값=화면값): ${fmtNum(rec.normalized_value)} ${escapeHtml(rec.unit)}
record_id: ${escapeHtml(rec.record_id)}</pre>
    </div>`;

  el.innerHTML = `
    <p class="meta-line">전체 정상 수신 ${rows.length}건 중, 서로 다른 실제 날짜의 가장 최근 인접한 두 건(어제·오늘)을 사용합니다.</p>
    <div class="evidence-grid">
      ${recordBlock("① 이전 날(어제 기준)", a)}
      ${recordBlock("② 최근 날(오늘 기준)", b)}
    </div>
    <div class="lkg-box" style="margin-top:14px; background: var(--bg); border:1px solid var(--border);">
      <strong>독립 재계산:</strong> ${fmtNum(b.normalized_value)} − ${fmtNum(a.normalized_value)} =
      <strong>${recomputed >= 0 ? "+" : ""}${fmtNum(recomputed)}원</strong>
      (최근 날 저장값 − 이전 날 저장값, 위 "일별 기록" 카드가 쓰는 값과 같은 원천에서 이 함수가 독립적으로 다시 계산)
      ${matchesDisplayed === true ? `<div class="delta up" style="margin-top:6px;">✓ 위 오늘 카드의 "전일 대비" 표시값과 일치합니다</div>` : ""}
      ${matchesDisplayed === false ? `<div class="fail-explainer" style="margin-top:6px;">⚠ 위 표시값과 다릅니다</div>` : ""}
    </div>
  `;
}

function renderReplaySection(replayDoc) {
  const grid = document.getElementById("replay-grid");
  const replays = (replayDoc && replayDoc.replays) || {};
  const order = ["timeout", "auth", "rate_limit", "offline", "schema_error"];
  const items = order.map(k => replays[k]).filter(Boolean);

  if (items.length === 0) {
    grid.innerHTML = `<p class="muted">아직 재생된 기록이 없습니다. (GitHub Actions에서 workflow_dispatch로 5종을 1회씩 실행하면 채워집니다.)</p>`;
    return;
  }

  grid.innerHTML = items.map(it => `
    <div class="replay-item">
      <span class="type-label">${ERROR_LABEL_KO[it.error_code] || it.error_code}</span>
      <span class="meta-line">재생 시각(KST): ${fmtDateTime(it.replayed_at)}</span>
      <span class="meta-line">상태: ${it.status.freshness} / ${it.status.error_code} · 행 개수 유지: ${it.row_count_after}</span>
      <div class="msg">${escapeHtml(it.user_facing_message)}</div>
    </div>
  `).join("");
}

async function main() {
  document.getElementById("source-link").href = SOURCE_URL;

  try {
    const [state, replay] = await Promise.all([
      loadJSON("./data/history.json"),
      loadJSON("./data/failure_replay.json").catch(() => ({ replays: {} })),
    ]);
    renderRefTzBanner(state);
    renderTodayCard(state);
    renderEvidence(state);
    renderHistoryTable(state);
    renderDayPairSection(state);
    renderReplaySection(replay);
    renderCsvButton(state);
  } catch (err) {
    document.getElementById("today-card").innerHTML =
      `<p class="fail-explainer">페이지 데이터를 불러오는 중 오류가 발생했습니다: ${err.message}</p>`;
  }
}

main();

// 오늘의 진짜 정보판 — 프론트엔드 렌더링 스크립트 (카드 1~3: JPY/KRW)
// 외부 라이브러리 없이 순수 JS(Vanilla JS)로 작성됨.
// data/history.json(=저장 상태), data/failure_replay.json을 fetch로 읽어 화면에 그린다.
//
// history.json의 모양은 adapter/reading-store.js의 resetEvaluationState()가 만드는 상태와
// 같습니다: daily_readings는 "성공한 날짜"만 담고, 실패는 daily_readings를 건드리지 않은 채
// status(freshness/error_code)로만 표시됩니다. 그래서 실패 중에도 daily_readings의 마지막 행이
// 곧 "마지막 정상값"입니다(T04-C17).

// TODO: GitHub에 올린 뒤 실제 저장소 주소로 바꿔주세요.
const SOURCE_URL = "https://github.com/YOUR_USERNAME/YOUR_REPO";

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
    tbody.innerHTML = `<tr><td colspan="4" class="muted">아직 정상 수신 기록이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.record_date}</td>
      <td class="num">${fmtNum(r.normalized_value)}</td>
      <td>${fmtDateTime(r.reading.source_time)}</td>
      <td>${fmtDateTime(r.reading.fetched_at)}</td>
    </tr>
  `).join("");
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
    renderReplaySection(replay);
  } catch (err) {
    document.getElementById("today-card").innerHTML =
      `<p class="fail-explainer">페이지 데이터를 불러오는 중 오류가 발생했습니다: ${err.message}</p>`;
  }
}

main();

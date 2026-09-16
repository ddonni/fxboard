// 오늘의 진짜 정보판 — 프론트엔드 렌더링 스크립트 (카드 1: JPY/KRW)
// 외부 라이브러리 없이 순수 JS(Vanilla JS)로 작성됨.
// data/history.json, data/failure_replay.json을 fetch로 읽어 화면에 그린다.

// TODO: GitHub에 올린 뒤 실제 저장소 주소로 바꿔주세요.
const SOURCE_URL = "https://github.com/YOUR_USERNAME/YOUR_REPO";

const REASON_KO = {
  timeout: "데이터 소스 응답 시간 초과",
  http_4xx: "데이터 소스가 요청을 거부함(4xx)",
  http_5xx: "데이터 소스 서버 오류(5xx)",
  malformed_response: "응답 형식이 손상되어 해석 불가",
  empty_data: "응답에 값이 비어 있음",
  network_error: "네트워크 연결 실패",
};

function kstTodayStr() {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  return kst.toISOString().slice(0, 10);
}

function fmtKrw(v) {
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
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} 로드 실패 (${res.status})`);
  return res.json();
}

function findLastOkBefore(records, indexExclusive) {
  for (let i = indexExclusive - 1; i >= 0; i--) {
    if (records[i].status === "ok") return records[i];
  }
  return null;
}

function findLatestOk(records) {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].status === "ok") return records[i];
  }
  return null;
}

function renderRefTzBanner(history) {
  const el = document.getElementById("ref-tz-banner");
  const tz = history.reference_timezone || "Asia/Seoul (KST, UTC+9)";
  el.textContent = `기준 시간대: ${tz} — 이 페이지의 모든 시각은 KST로 표시됩니다.`;
}

function renderTodayCard(history) {
  const el = document.getElementById("today-card");
  const records = (history.records || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const unit = history.unit || "KRW / 100 JPY (100엔당 원)";

  if (records.length === 0) {
    el.innerHTML = `
      <div class="status-row"><span class="badge fail">기록 없음</span></div>
      <p class="meta-line">아직 수집된 기록이 없습니다. 자동 수집은 매일 00:10(KST)에 GitHub Actions로 실행됩니다.
      배포 직후에는 첫 실행 전까지 이 상태가 정상입니다.</p>
      <p class="meta-line">단위(예정): ${unit}</p>
    `;
    return;
  }

  const latest = records[records.length - 1];
  const latestIdx = records.length - 1;
  const isToday = latest.date === kstTodayStr();

  if (latest.status === "ok") {
    const prevOk = findLastOkBefore(records, latestIdx);
    let deltaHtml = `<p class="meta-line">비교할 이전 정상 기록이 아직 없습니다.</p>`;
    if (prevOk) {
      const diff = latest.rate_per_100jpy - prevOk.rate_per_100jpy;
      const pct = (diff / prevOk.rate_per_100jpy) * 100;
      const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
      const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "＝";
      deltaHtml = `
        <p class="delta ${dir}">${arrow} ${diff >= 0 ? "+" : ""}${fmtKrw(diff)}원 (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)
          <span class="meta-line" style="display:inline">— ${prevOk.date} → ${latest.date} 비교</span></p>
      `;
    }
    el.innerHTML = `
      <div class="status-row">
        <span class="badge ok">${isToday ? "오늘 정상 수신" : "최근 정상 수신"}</span>
        <span class="meta-line">기록일 ${latest.date}</span>
      </div>
      <div class="rate-main">100엔 = ${fmtKrw(latest.rate_per_100jpy)}원</div>
      <div class="unit-line"><strong>단위:</strong> ${latest.unit || unit}</div>
      <div class="source-line"><strong>출처:</strong> <a href="https://open.er-api.com/v6/latest/JPY" target="_blank" rel="noopener">ExchangeRate-API (open.er-api.com)</a></div>
      <div class="times-grid">
        <div><strong>출처 시각(KST):</strong> ${fmtDateTime(latest.source_time_kst)}</div>
        <div><strong>조회 시각(KST):</strong> ${fmtDateTime(latest.fetched_at)}</div>
      </div>
      ${deltaHtml}
    `;
  } else {
    const reasonKo = REASON_KO[latest.reason] || latest.reason || "알 수 없는 오류";
    const lkg = latest.last_known_good;
    el.innerHTML = `
      <div class="status-row">
        <span class="badge fail">${isToday ? "오늘 수집 실패" : "최근 수집 실패"}</span>
        <span class="meta-line">기록일 ${latest.date}</span>
      </div>
      <div class="unit-line"><strong>단위:</strong> ${unit}</div>
      <div class="source-line"><strong>출처:</strong> <a href="https://open.er-api.com/v6/latest/JPY" target="_blank" rel="noopener">ExchangeRate-API (open.er-api.com)</a></div>
      <div class="fail-explainer">
        데이터 소스에서 값을 가져오지 못했습니다.<br>
        <strong>사유:</strong> ${reasonKo}${latest.http_status ? ` (HTTP ${latest.http_status})` : ""}<br>
        <strong>조회 시도 시각(KST):</strong> ${fmtDateTime(latest.fetched_at)}
      </div>
      ${lkg
        ? `<div class="lkg-box"><strong>마지막 정상값 보존:</strong> 100엔 = ${fmtKrw(lkg.rate_per_100jpy)}원
           <span class="meta-line" style="display:inline">(${lkg.date} 기준, 출처 시각 ${fmtDateTime(lkg.source_time_kst)})</span></div>`
        : `<p class="meta-line">보존된 이전 정상값이 아직 없습니다 (첫 수집부터 실패한 경우).</p>`}
    `;
  }
}

function renderEvidence(history) {
  const el = document.getElementById("evidence-body");
  const records = (history.records || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const rec = findLatestOk(records);

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

  const screenText = `100엔 = ${fmtKrw(rec.rate_per_100jpy)}원 (출처 시각 ${fmtDateTime(rec.source_time_kst)} KST, 조회 시각 ${fmtDateTime(rec.fetched_at)} KST)`;

  el.innerHTML = `
    <p class="meta-line">대조 대상 기록: ${rec.date} (상태: 정상)</p>
    <div class="evidence-grid">
      <div class="evidence-col">
        <h3>① 원자료 (API 원문)</h3>
        <pre class="code-block">${rawHtml}</pre>
      </div>
      <div class="evidence-col">
        <h3>② 저장값 (history.json)</h3>
        <pre class="code-block">rate_per_jpy: ${rec.rate_per_jpy}
rate_per_100jpy: ${rec.rate_per_100jpy}
source_time_utc: ${escapeHtml(rec.source_time_utc || "-")}
source_time_kst: ${escapeHtml(rec.source_time_kst || "-")}
fetched_at: ${escapeHtml(rec.fetched_at || "-")}
http_status: ${rec.http_status}</pre>
      </div>
      <div class="evidence-col">
        <h3>③ 화면값 (위 카드에 표시된 문장)</h3>
        <div class="code-block screen-value">${escapeHtml(screenText)}</div>
        <p class="meta-line">계산: 저장값(1 JPY당 ${rec.rate_per_jpy} KRW) × 100 = ${rec.rate_per_100jpy}</p>
      </div>
    </div>
  `;
}

function renderHistoryTable(history) {
  const tbody = document.getElementById("history-tbody");
  const records = (history.records || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">아직 기록이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => {
    if (r.status === "ok") {
      return `<tr>
        <td>${r.date}</td>
        <td><span class="badge ok">정상</span></td>
        <td class="num">${fmtKrw(r.rate_per_100jpy)}</td>
        <td>${fmtDateTime(r.source_time_kst)}</td>
        <td>${fmtDateTime(r.fetched_at)}</td>
        <td class="muted">-</td>
      </tr>`;
    }
    const reasonKo = REASON_KO[r.reason] || r.reason || "-";
    return `<tr>
      <td>${r.date}</td>
      <td><span class="badge fail">실패</span></td>
      <td class="num muted">-</td>
      <td class="muted">-</td>
      <td>${fmtDateTime(r.fetched_at)}</td>
      <td class="muted">${reasonKo}${r.last_known_good ? ` · 마지막정상 ${r.last_known_good.rate_per_100jpy}(${r.last_known_good.date})` : ""}</td>
    </tr>`;
  }).join("");
}

function renderReplaySection(replayDoc) {
  const grid = document.getElementById("replay-grid");
  const replays = (replayDoc && replayDoc.replays) || {};
  const order = ["timeout", "http_4xx", "http_5xx", "malformed", "empty"];
  const items = order.map(k => replays[k]).filter(Boolean);

  if (items.length === 0) {
    grid.innerHTML = `<p class="muted">아직 재생된 기록이 없습니다. (GitHub Actions에서 workflow_dispatch로 5종을 1회씩 실행하면 채워집니다.)</p>`;
    return;
  }

  grid.innerHTML = items.map(it => `
    <div class="replay-item">
      <span class="type-label">${it.label_ko}</span>
      <span class="meta-line">재생 시각(KST): ${fmtDateTime(it.replayed_at)}</span>
      <div class="msg">${it.user_facing_message}</div>
    </div>
  `).join("");
}

async function main() {
  document.getElementById("source-link").href = SOURCE_URL;

  try {
    const [history, replay] = await Promise.all([
      loadJSON("./data/history.json"),
      loadJSON("./data/failure_replay.json").catch(() => ({ replays: {} })),
    ]);
    renderRefTzBanner(history);
    renderTodayCard(history);
    renderEvidence(history);
    renderHistoryTable(history);
    renderReplaySection(replay);
  } catch (err) {
    document.getElementById("today-card").innerHTML =
      `<p class="fail-explainer">페이지 데이터를 불러오는 중 오류가 발생했습니다: ${err.message}</p>`;
  }
}

main();

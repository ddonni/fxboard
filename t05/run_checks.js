#!/usr/bin/env node
/*
 * t05/run_checks.js — 과제5 최종 실행 고정 검사 10개(DC-01~DC-10) 실행기
 *
 * 입력·기대값은 t05/CHECKS.md 표 그대로다. AI A·AI B 모두 이 파일을 바꾸지 않는다.
 *
 *   node t05/run_checks.js                  작업 트리를 검사하고 t05/runs.jsonl에 한 줄 추가
 *   node t05/run_checks.js --target <커밋>  그 버전을 git worktree로 꺼내 검사(기록 안 함)
 *
 * 필요: git, python3, Node 18+, npm 전역 playwright, Chromium.
 * playwright는 require → `npm root -g` 순서로 찾고, Chromium은 CHROMIUM_PATH →
 * PLAYWRIGHT_BROWSERS_PATH 기본 위치 → /opt/pw-browsers/chromium 순서로 찾는다.
 * 브라우저는 127.0.0.1 이외 요청을 전부 차단·기록한다(외부 네트워크 0회).
 */
"use strict";

const { execFileSync, execSync, spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { builtinModules } = require("module");

const REPO = path.resolve(__dirname, "..");
const IDS = ["DC-01", "DC-02", "DC-03", "DC-04", "DC-05", "DC-06", "DC-07", "DC-08", "DC-09", "DC-10"];
const DC07_EXPECTED = {
  "2026-09-17": "—",
  "2026-09-18": "▲ +4.95",
  "2026-09-19": "▲ +4.22",
  "2026-09-20": "▼ -3.96",
  "2026-09-21": "▼ -1.43",
};

const git = (args, cwd = REPO) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function baselineCommit() {
  const lines = git(["log", "--diff-filter=A", "--format=%H", "--", "t05/CHECKS.md"]).split("\n").filter(Boolean);
  if (!lines.length) throw new Error("기준 버전을 찾을 수 없음(t05/CHECKS.md를 추가한 커밋이 없음)");
  return lines[lines.length - 1];
}

function addWorktree(commit, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t05f-${label}-`));
  fs.rmSync(dir, { recursive: true, force: true });
  git(["worktree", "add", "--detach", dir, commit]);
  return dir;
}
function removeWorktree(dir) { try { git(["worktree", "remove", "--force", dir]); } catch (e) { /* 무시 */ } }

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { /* 다음 방법 */ }
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(root, "playwright"));
  } catch (e) {
    throw new Error("playwright를 찾을 수 없음 — `npm install -g playwright` 후 다시 실행하거나 NODE_PATH=$(npm root -g) 로 실행");
  }
}
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return undefined;
  if (fs.existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  return undefined;
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function startServer(dir) {
  const port = await freePort();
  const proc = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: dir, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((r) => { const s = net.connect(port, "127.0.0.1", () => { s.end(); r(true); }); s.on("error", () => r(false)); });
    if (ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url: `http://127.0.0.1:${port}/index.html`, stop: () => proc.kill() };
}

// ── DC-01~06: 순수 함수 ───────────────────────────────────────────────
function logicChecks(root) {
  const out = [];
  let fn = null, loadErr = null;
  try {
    const p = path.join(root, "daily-change.js");
    delete require.cache[p];
    fn = require(p).computeDailyChanges;
    if (typeof fn !== "function") throw new Error("computeDailyChanges가 함수가 아님");
  } catch (e) { loadErr = `daily-change.js를 불러올 수 없음: ${e.message.split("\n")[0]}`; }

  const run = (id, body) => {
    if (loadErr) return out.push({ id, status: "FAIL", detail: loadErr });
    try { out.push({ id, status: "PASS", detail: body() }); }
    catch (e) { out.push({ id, status: "FAIL", detail: e.message }); }
  };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
  const J = JSON.stringify;
  const r = (d, v) => ({ record_date: d, normalized_value: v });

  run("DC-01", () => { const o = fn([]); expect(Array.isArray(o) && o.length === 0, `기대 [] / 실제 ${J(o)}`); return "빈 배열, 예외 없음"; });
  run("DC-02", () => {
    const o = fn([r("2026-09-17", 876.93)]);
    expect(o.length === 1, `길이 ${o.length}`);
    const e = o[0];
    const ok = e.record_date === "2026-09-17" && e.value === 876.93 && e.delta === null && e.direction === null && e.label === "—";
    expect(ok, `원소가 기대와 다름: ${J(e)}`);
    return "delta null, direction null, label —";
  });
  run("DC-03", () => {
    const o = fn([r("2026-09-17", 876.93), r("2026-09-18", 882.14), r("2026-09-19", 880.71)]);
    const got = { d: o.map((x) => x.delta), dir: o.map((x) => x.direction), l: o.map((x) => x.label) };
    const want = { d: [null, 5.21, -1.43], dir: [null, "up", "down"], l: ["—", "▲ +5.21", "▼ -1.43"] };
    expect(J(got) === J(want), `기대 ${J(want)} / 실제 ${J(got)}`);
    return J(want.l);
  });
  run("DC-04", () => {
    const e = fn([r("2026-09-17", 880.0), r("2026-09-18", 880.0)])[1];
    expect(e.delta === 0 && e.direction === "flat" && e.label === "= 0.00", `실제 ${J(e)}`);
    return "delta 0, flat, = 0.00";
  });
  run("DC-05", () => {
    const e = fn([r("2026-09-17", 880.1), r("2026-09-18", 880.3)])[1];
    expect(e.delta === 0.2 && e.label === "▲ +0.20", `실제 delta=${e.delta}, label=${J(e.label)}`);
    return "delta === 0.2, ▲ +0.20";
  });
  run("DC-06", () => {
    const input = [r("2026-09-19", 880.0), r("2026-09-17", 876.0), r("2026-09-18", 878.5)];
    const before = J(input);
    const o = fn(input);
    const dates = o.map((x) => x.record_date), labels = o.map((x) => x.label);
    expect(J(dates) === J(["2026-09-17", "2026-09-18", "2026-09-19"]), `날짜 순서 ${J(dates)}`);
    expect(J(labels) === J(["—", "▲ +2.50", "▲ +1.50"]), `label ${J(labels)}`);
    expect(J(input) === before, `입력이 바뀜: ${J(input)}`);
    expect(o !== input, "입력 배열을 그대로 반환함(새 배열이어야 함)");
    return "오름차순 새 배열, 입력 불변";
  });
  return out;
}

// ── DC-07~09: 화면 ───────────────────────────────────────────────────
async function openPage(browser, url, history, blocked) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "127.0.0.1") { blocked.push(route.request().url()); return route.abort(); }
    if (u.pathname === "/favicon.ico") return route.fulfill({ status: 204, body: "" });
    if (u.pathname === "/data/history.json") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(history) });
    return route.continue();
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return { context, page, errors };
}

async function readTable(page) {
  return page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll("#history-table thead th")).map((t) => t.innerText.trim());
    const rows = Array.from(document.querySelectorAll("#history-tbody tr")).map((tr) => Array.from(tr.children).map((c) => c.innerText.trim()));
    return { ths, rows };
  });
}

async function domChecks(targetRoot, baselineRoot, history) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"] });
  const blocked = [];
  const out = [];
  const tSrv = await startServer(targetRoot);
  const bSrv = await startServer(baselineRoot);
  const sorted = history.daily_readings.slice().sort((a, b) => a.record_date.localeCompare(b.record_date));
  const one = { ...history, daily_readings: sorted.slice(0, 1) };
  try {
    // DC-07
    const t = await openPage(browser, tSrv.url, history, blocked);
    const tab = await readTable(t.page);
    const col = tab.ths.indexOf("전일 대비");
    if (col < 0) out.push({ id: "DC-07", status: "FAIL", detail: `헤더에 "전일 대비" 열 없음 (헤더: ${JSON.stringify(tab.ths)})` });
    else {
      const got = {};
      for (const row of tab.rows) got[row[0]] = row[col];
      const bad = Object.keys(DC07_EXPECTED).filter((d) => got[d] !== DC07_EXPECTED[d]);
      if (tab.rows.length !== 5 || bad.length) out.push({ id: "DC-07", status: "FAIL", detail: `행 ${tab.rows.length}개, 불일치: ${bad.map((d) => `${d} 기대 ${JSON.stringify(DC07_EXPECTED[d])} 실제 ${JSON.stringify(got[d])}`).join("; ") || "없음"}` });
      else out.push({ id: "DC-07", status: "PASS", detail: "5행 모두 기대값과 일치" });
    }

    // DC-08
    const o = await openPage(browser, tSrv.url, one, blocked);
    const otab = await readTable(o.page);
    const ocol = otab.ths.indexOf("전일 대비");
    const cell = ocol >= 0 && otab.rows[0] ? otab.rows[0][ocol] : undefined;
    const ok8 = ocol >= 0 && otab.rows.length === 1 && cell === "—" && o.errors.length === 0;
    out.push({ id: "DC-08", status: ok8 ? "PASS" : "FAIL", detail: `열 ${ocol >= 0 ? "있음" : "없음"}, 행 ${otab.rows.length}개, 칸 ${JSON.stringify(cell)}, JS 오류 ${o.errors.length}건${o.errors.length ? ": " + o.errors.join(" | ") : ""}` });

    // DC-09
    const b = await openPage(browser, bSrv.url, history, blocked);
    const grab = (page) => page.evaluate(() => {
      const secs = Array.from(document.querySelectorAll("main > section"));
      const hist = secs.find((s) => s.querySelector("#history-table"));
      const others = secs.filter((s) => s !== hist).map((s) => s.innerText.replace(/\s+/g, " ").trim());
      let outside = "";
      if (hist) { const c = hist.cloneNode(true); const tw = c.querySelector("#history-table"); if (tw) tw.remove(); outside = c.innerText.replace(/\s+/g, " ").trim(); }
      return { others, outside };
    });
    const bs = await grab(b.page), ts = await grab(t.page);
    const btab = await readTable(b.page);
    const strip = (tb) => {
      const c = tb.ths.indexOf("전일 대비");
      const keep = (arr) => arr.filter((_, i) => i !== c);
      return { ths: c < 0 ? tb.ths : keep(tb.ths), rows: tb.rows.map((r) => (c < 0 ? r : keep(r))) };
    };
    const diffs = [];
    if (bs.others.length !== 5 || ts.others.length !== 5) diffs.push(`다른 섹션 수 기준 ${bs.others.length} / 대상 ${ts.others.length}`);
    bs.others.forEach((txt, i) => { if (ts.others[i] !== txt) diffs.push(`다른 섹션 ${i + 1} 텍스트 다름`); });
    if (bs.outside !== ts.outside) diffs.push("일별 기록 섹션의 표 밖 내용 다름");
    if (JSON.stringify(strip(btab)) !== JSON.stringify(strip(tab))) diffs.push("표의 기존 4개 열 내용 다름");
    if (t.errors.length) diffs.push(`대상 콘솔 오류 ${t.errors.length}건: ${t.errors.join(" | ")}`);
    out.push({ id: "DC-09", status: diffs.length ? "FAIL" : "PASS", detail: diffs.length ? diffs.join("; ") : "5개 섹션·표 밖 내용·기존 4개 열 동일, 콘솔 오류 0건" });
    await t.context.close(); await o.context.close(); await b.context.close();
  } finally {
    tSrv.stop(); bSrv.stop();
    await browser.close();
  }
  return { out, blocked };
}

// ── DC-10: 비밀값·의존성 ─────────────────────────────────────────────
function dc10(root, base, targetCommit) {
  const problems = [];
  try { execFileSync("python3", ["scripts/check_secrets.py"], { cwd: root, stdio: "pipe" }); }
  catch (e) { problems.push(`check_secrets.py exit ${e.status}`); }
  const diffArgs = targetCommit ? ["diff", "-U0", base, targetCommit, "--", ".", ":(exclude)t05"] : ["diff", "-U0", base, "--", ".", ":(exclude)t05"];
  let added = git(diffArgs, root).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const untracked = targetCommit ? [] : git(["ls-files", "--others", "--exclude-standard", "--", ".", ":(exclude)t05"], root).split("\n").filter(Boolean);
  for (const f of untracked) {
    try { added = added.concat(fs.readFileSync(path.join(root, f), "utf8").split("\n").map((l) => "+" + l)); } catch (e) { /* 바이너리 등 무시 */ }
  }
  for (const l of added) {
    if (/<script[^>]+src=["']https?:/i.test(l)) problems.push(`외부 script: ${l.trim().slice(0, 100)}`);
    if (/cdnjs|jsdelivr|unpkg|\/\/cdn\./i.test(l)) problems.push(`CDN: ${l.trim().slice(0, 100)}`);
    for (const m of l.matchAll(/(?:require\(\s*|from\s+|import\s+)["']([^"']+)["']/g)) {
      const spec = m[1], bare = spec.replace(/^node:/, "").split("/")[0];
      if (!spec.startsWith(".") && !spec.startsWith("/") && !builtinModules.includes(bare)) problems.push(`외부 모듈 "${spec}"`);
    }
  }
  const files = git(["ls-files"], root).split("\n").concat(untracked);
  if (files.some((f) => /(^|\/)package\.json$|(^|\/)node_modules\//.test(f))) problems.push("package.json 또는 node_modules 있음");
  return { id: "DC-10", status: problems.length ? "FAIL" : "PASS", detail: problems.length ? problems.join("; ") : "비밀값 0건, 외부 script·CDN·외부 모듈 추가 0건, package.json 없음" };
}

(async () => {
  const argv = process.argv.slice(2);
  const ti = argv.indexOf("--target");
  const target = ti >= 0 ? argv[ti + 1] : null;
  const base = baselineCommit();
  const history = JSON.parse(git(["show", `${base}:data/history.json`]));
  const baseRoot = addWorktree(base, "base");
  let root = REPO, targetCommit = null, targetRoot = null;
  if (target) { targetCommit = git(["rev-parse", `${target}^{commit}`]); targetRoot = addWorktree(targetCommit, "target"); root = targetRoot; }
  let results, blocked;
  try {
    const dom = await domChecks(root, baseRoot, history);
    results = [...logicChecks(root), ...dom.out, dc10(root, base, targetCommit)];
    blocked = dom.blocked;
  } finally {
    removeWorktree(baseRoot);
    if (targetRoot) removeWorktree(targetRoot);
  }
  results.sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id));
  const failed = results.filter((r) => r.status !== "PASS").map((r) => r.id);
  for (const r of results) console.log(`[${r.status}] ${r.id} — ${r.detail}`);
  const head = git(["rev-parse", "HEAD"]);
  const entry = {
    at: new Date().toISOString(),
    mode: target ? "target" : "working-tree",
    commit: targetCommit || head,
    dirty: target ? false : git(["status", "--porcelain", "--", ".", ":(exclude)t05/runs.jsonl"]) !== "",
    pass: results.length - failed.length,
    fail: failed.length,
    failed_ids: failed,
    external_requests_blocked: blocked.length,
    checks_sha256: sha256(path.join(REPO, "t05/CHECKS.md")),
    runner_sha256: sha256(__filename),
    node: process.version,
  };
  console.log(`\n${entry.commit.slice(0, 7)}${entry.dirty ? "(+작업 중 변경)" : ""}: ${entry.pass}/10 PASS, 첫 실패 검사: ${failed[0] || "없음"}, 외부 요청 차단 ${blocked.length}건`);
  if (!target) {
    fs.appendFileSync(path.join(REPO, "t05/runs.jsonl"), JSON.stringify(entry) + "\n");
    console.log("기록: t05/runs.jsonl");
  } else if (argv.includes("--json")) {
    console.log(JSON.stringify({ ...entry, results }, null, 2));
  }
})().catch((e) => { console.error(`실행기 오류: ${e.message}`); process.exit(2); });

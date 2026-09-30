#!/usr/bin/env node
/*
 * scripts/run_t05_checks.js — 과제5 고정 검사 10개(CSV-01~CSV-10) 재현 실행기
 *
 * T05_CARD1.md "고정 검사 10개" 표의 입력·기대값을 그대로 구현한다. 검사 정의는 바꾸지
 * 않는다. 특정 버전(커밋)을 git worktree로 따로 꺼내서 검사하므로, 지금 작업 트리가
 * 어떤 상태든 "그 버전이 그 시점에 몇 개를 통과했는가"를 언제든 다시 확인할 수 있다.
 *
 * 대상 버전의 테스트 스크립트(scripts/test_csv_export_logic.js)를 믿지 않고 입력·기대값을
 * 여기서 독립적으로 다시 구현한다 — 어느 세션이 테스트를 약하게 고쳐도 결과가 흔들리지
 * 않게 하기 위해서다.
 *
 * 사용법 (저장소 루트에서):
 *   NODE_PATH=$(npm root -g) node scripts/run_t05_checks.js --target <커밋> [--baseline 75fd977] [--out <결과.json>]
 *
 * 필요 조건: git, python3, Node 18+, playwright(npm 전역 설치 가능), Chromium.
 * 외부 네트워크: 사용하지 않는다. 브라우저는 127.0.0.1 이외 요청을 전부 차단하고 기록한다.
 */
"use strict";

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { builtinModules } = require("module");

const REPO = path.resolve(__dirname, "..");
const SELF_REL = "scripts/run_t05_checks.js"; // 검증 도구 자신 — CSV-10 diff 검사에서 제외(검사 대상 코드가 아님)
const HEADER = "record_date,normalized_value,source_time_kst,fetched_time_kst";

function parseArgs(argv) {
  const args = { target: "HEAD", baseline: "75fd977", out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--target") args.target = argv[++i];
    else if (argv[i] === "--baseline") args.baseline = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

function git(args, cwd = REPO) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function addWorktree(commit, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t05-${label}-`));
  fs.rmSync(dir, { recursive: true, force: true });
  git(["worktree", "add", "--detach", dir, commit]);
  return dir;
}

function removeWorktree(dir) {
  try { git(["worktree", "remove", "--force", dir]); } catch (e) { /* 이미 없으면 무시 */ }
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
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise((resolve) => {
      const sock = net.connect(port, "127.0.0.1", () => { sock.end(); resolve(true); });
      sock.on("error", () => resolve(false));
    });
    if (ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url: `http://127.0.0.1:${port}/index.html`, stop: () => proc.kill() };
}

// RFC4180 한 줄 파서 — CSV-03의 "열 개수 4개 유지"를 CSV 규칙대로 센다
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function logicChecks(root) {
  const results = [];
  const modPath = path.join(root, "csv-export.js");
  let rowsToCsv = null;
  let loadErr = null;
  try {
    delete require.cache[require.resolve(modPath)];
    rowsToCsv = require(modPath).rowsToCsv;
    if (typeof rowsToCsv !== "function") throw new Error("rowsToCsv 함수가 없음");
  } catch (e) { loadErr = `csv-export.js를 불러올 수 없음: ${e.message}`; }

  const run = (id, fn) => {
    if (loadErr) return results.push({ id, status: "FAIL", detail: loadErr });
    try { const detail = fn(); results.push({ id, status: "PASS", detail }); }
    catch (e) { results.push({ id, status: "FAIL", detail: e.message }); }
  };
  const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

  run("CSV-01", () => {
    const lines = rowsToCsv([]).split("\n");
    expect(lines.length === 1 && lines[0] === HEADER, `기대: 헤더 1줄 / 실제: ${JSON.stringify(lines)}`);
    return "헤더 1줄만 반환, 예외 없음";
  });
  run("CSV-02", () => {
    const lines = rowsToCsv([{ record_date: "2026-09-17", normalized_value: 876.93, source_time_kst: "2026-09-16 09:02:00", fetched_time_kst: "2026-09-17 00:10:05" }]).split("\n");
    const want = "2026-09-17,876.93,2026-09-16 09:02:00,2026-09-17 00:10:05";
    expect(lines.length === 2 && lines[1] === want, `기대: 2줄, 둘째 줄 ${want} / 실제: ${JSON.stringify(lines)}`);
    return "2줄, 둘째 줄 일치";
  });
  run("CSV-03", () => {
    const line = rowsToCsv([{ record_date: "2026-09-18", normalized_value: 880, source_time_kst: "09:02, KST", fetched_time_kst: "2026-09-18 00:10:05" }]).split("\n")[1];
    const cols = parseCsvLine(line);
    expect(line.includes('"09:02, KST"'), `쉼표 필드가 큰따옴표로 감싸지지 않음: ${line}`);
    expect(cols.length === 4, `RFC4180 파싱 시 열 ${cols.length}개(기대 4개): ${line}`);
    return `"09:02, KST"로 감쌈, RFC4180 파싱 시 4열 (단순 문자열 split 기준은 해석에서 제외 — T05_CARD2.md 참고)`;
  });
  run("CSV-04", () => {
    const line = rowsToCsv([{ record_date: "2026-09-19", normalized_value: 882, source_time_kst: '9시 "정각"', fetched_time_kst: "2026-09-19 00:10:05" }]).split("\n")[1];
    const want = '"9시 ""정각"""';
    expect(line.includes(want), `기대 필드 ${want} 없음: ${line}`);
    return `큰따옴표 이중 처리 + 필드 감쌈: ${want}`;
  });
  run("CSV-05", () => {
    const rows = ["2026-09-19", "2026-09-17", "2026-09-18"].map((d, i) => ({ record_date: d, normalized_value: i, source_time_kst: "x", fetched_time_kst: "x" }));
    const got = rowsToCsv(rows).split("\n").slice(1).map((l) => parseCsvLine(l)[0]);
    expect(JSON.stringify(got) === JSON.stringify(["2026-09-19", "2026-09-17", "2026-09-18"]), `순서가 바뀜: ${JSON.stringify(got)}`);
    return "입력 순서 09-19→09-17→09-18 그대로";
  });
  return { results, rowsToCsv };
}

async function openPage(browser, url, blocked) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1") return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  return { context, page, errors: () => errors.filter((e) => !/favicon\.ico|status of 404 \(File not found\)/.test(e)) };
}

async function sectionTexts(page, removeSelector) {
  return page.evaluate((sel) => {
    if (sel) document.querySelectorAll(sel).forEach((el) => el.remove());
    return Array.from(document.querySelectorAll("main > section")).map((s) => s.innerText.replace(/\s+/g, " ").trim());
  }, removeSelector);
}

async function domChecks(targetRoot, baselineRoot, rowsToCsv) {
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch (e) { throw new Error("playwright를 찾을 수 없음 — NODE_PATH=$(npm root -g)로 실행하세요"); }
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({
    executablePath: exe,
    args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
  });
  const blocked = [];
  const results = [];
  const tSrv = await startServer(targetRoot);
  const bSrv = await startServer(baselineRoot);
  try {
    const t = await openPage(browser, tSrv.url, blocked);
    const BTN = 'main > section:has(#history-table) >> role=button[name=/CSV 다운로드/]';
    const count = await t.page.locator(BTN).count();

    // CSV-06
    results.push(count >= 1
      ? { id: "CSV-06", status: "PASS", detail: `"일별 기록" 섹션 안에 "CSV 다운로드" 버튼 ${count}개` }
      : { id: "CSV-06", status: "FAIL", detail: `"일별 기록" 섹션(#history-table 포함) 안에 "CSV 다운로드" 버튼이 없음` });

    // CSV-07 — 정의 문구 그대로: 다운로드 내용 === rowsToCsv(state.daily_readings)
    if (count < 1) {
      results.push({ id: "CSV-07", status: "FAIL", detail: "버튼이 없어 클릭할 수 없음" });
    } else {
      const history = JSON.parse(fs.readFileSync(path.join(targetRoot, "data/history.json"), "utf8"));
      const expected = rowsToCsv ? rowsToCsv(history.daily_readings) : null;
      let got = null, err = null;
      try {
        const [dl] = await Promise.all([t.page.waitForEvent("download", { timeout: 5000 }), t.page.locator(BTN).first().click()]);
        got = fs.readFileSync(await dl.path(), "utf8");
      } catch (e) { err = e.message; }
      if (err) results.push({ id: "CSV-07", status: "FAIL", detail: `다운로드가 일어나지 않음: ${err}` });
      else if (got === expected) results.push({ id: "CSV-07", status: "PASS", detail: "다운로드 내용이 rowsToCsv(state.daily_readings)와 문자열 단위로 완전히 동일" });
      else results.push({
        id: "CSV-07", status: "FAIL",
        detail: `다운로드 내용 ≠ rowsToCsv(state.daily_readings). 기대 2번째 줄: ${JSON.stringify((expected || "").split("\n")[1])} / 실제 2번째 줄: ${JSON.stringify(got.split("\n")[1])}`,
      });
    }

    // CSV-08 — 접근 가능한 이름 + Tab 포커스 + Enter 실행
    if (count < 1) {
      results.push({ id: "CSV-08", status: "FAIL", detail: "버튼이 없음" });
    } else {
      const fresh = await openPage(browser, tSrv.url, blocked);
      const btn = fresh.page.locator(BTN).first();
      const name = await btn.evaluate((el) => (el.getAttribute("aria-label") || el.textContent || "").trim());
      let reached = false;
      for (let i = 0; i < 80 && !reached; i++) {
        await fresh.page.keyboard.press("Tab");
        reached = await btn.evaluate((el) => document.activeElement === el);
      }
      let entered = false;
      if (reached) {
        try {
          await Promise.all([fresh.page.waitForEvent("download", { timeout: 5000 }), fresh.page.keyboard.press("Enter")]);
          entered = true;
        } catch (e) { /* entered=false */ }
      }
      const ok = name.length > 0 && reached && entered;
      results.push({ id: "CSV-08", status: ok ? "PASS" : "FAIL", detail: `접근 가능한 이름="${name}", Tab 도달=${reached}, Enter 실행(다운로드 발생)=${entered}` });
      await fresh.context.close();
    }

    // CSV-09 — 기존 6개 섹션 회귀 없음 (기준선 렌더링과 비교, 새 버튼 자체는 제외)
    const b = await openPage(browser, bSrv.url, blocked);
    const before = await sectionTexts(b.page, null);
    const t2 = await openPage(browser, tSrv.url, blocked);
    const btnHandles = await t2.page.locator(BTN).count();
    if (btnHandles > 0) await t2.page.locator(BTN).evaluateAll((els) => els.forEach((el) => el.setAttribute("data-t05-new", "1")));
    const after = await sectionTexts(t2.page, '[data-t05-new="1"]');
    const svgBefore = await b.page.locator("#today-card svg").count();
    const svgAfter = await t2.page.locator("#today-card svg").count();
    const diffs = [];
    if (before.length !== after.length) diffs.push(`섹션 수 ${before.length} → ${after.length}`);
    for (let i = 0; i < Math.min(before.length, after.length); i++) if (before[i] !== after[i]) diffs.push(`섹션 ${i + 1} 텍스트 다름`);
    if (svgBefore !== svgAfter) diffs.push(`#today-card svg ${svgBefore} → ${svgAfter}`);
    const errs = t2.errors();
    const ok9 = diffs.length === 0 && errs.length === 0 && before.length === 6;
    results.push({ id: "CSV-09", status: ok9 ? "PASS" : "FAIL", detail: ok9 ? `기준선 대비 6개 섹션 텍스트 동일(새 버튼 제외), 스파크라인 svg ${svgAfter}개 유지, 콘솔 에러 0건(favicon 404 제외)` : `차이: ${diffs.concat(errs).join("; ")}` });
    await b.context.close(); await t2.context.close(); await t.context.close();
  } finally {
    tSrv.stop(); bSrv.stop();
    await browser.close();
  }
  return { results, blocked };
}

function csv10(targetRoot, baselineCommit, targetCommit) {
  const problems = [];
  try { execFileSync("python3", ["scripts/check_secrets.py"], { cwd: targetRoot, stdio: "pipe" }); }
  catch (e) { problems.push(`check_secrets.py exit ${e.status}`); }
  const diff = git(["diff", "-U0", baselineCommit, targetCommit, "--", ".", `:(exclude)${SELF_REL}`]);
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  for (const l of added) {
    if (/<script[^>]+src=["']https?:/i.test(l)) problems.push(`외부 script src: ${l.trim()}`);
    if (/\/\/cdn\.|cdnjs|jsdelivr|unpkg/i.test(l)) problems.push(`CDN 참조: ${l.trim()}`);
    for (const m of l.matchAll(/(?:require\(\s*|from\s+|import\s+)["']([^"']+)["']/g)) {
      const spec = m[1];
      const bare = spec.replace(/^node:/, "").split("/")[0];
      if (!spec.startsWith(".") && !spec.startsWith("/") && !builtinModules.includes(bare)) problems.push(`외부 모듈 참조 "${spec}": ${l.trim()}`);
    }
  }
  const tracked = git(["ls-tree", "-r", "--name-only", targetCommit]).split("\n");
  if (tracked.some((f) => /(^|\/)package\.json$|(^|\/)node_modules\//.test(f))) problems.push("package.json 또는 node_modules가 저장소에 있음");
  return problems.length === 0
    ? { id: "CSV-10", status: "PASS", detail: `check_secrets.py exit 0, ${baselineCommit}..${targetCommit.slice(0, 7)} diff에 외부 script/CDN/외부 모듈 추가 0건, package.json·node_modules 없음` }
    : { id: "CSV-10", status: "FAIL", detail: problems.join("; ") };
}

(async () => {
  const args = parseArgs(process.argv);
  // 주석 달린 태그(t05-ai-a-stop 등)를 넘겨도 태그 객체가 아닌 커밋 ID로 풀어서 기록한다
  const targetCommit = git(["rev-parse", `${args.target}^{commit}`]);
  const baselineCommit = git(["rev-parse", "--short", `${args.baseline}^{commit}`]);
  const targetRoot = addWorktree(targetCommit, "target");
  const baselineRoot = addWorktree(baselineCommit, "baseline");
  let report;
  try {
    const logic = logicChecks(targetRoot);
    const dom = await domChecks(targetRoot, baselineRoot, logic.rowsToCsv);
    const all = [...logic.results, ...dom.results, csv10(targetRoot, baselineCommit, targetCommit)];
    const pass = all.filter((r) => r.status === "PASS").length;
    const firstFail = all.find((r) => r.status !== "PASS");
    report = {
      target_commit: targetCommit,
      target_commit_time: git(["log", "-1", "--format=%cI", targetCommit]),
      baseline_commit: baselineCommit,
      run_at_utc: new Date().toISOString(),
      runner: SELF_REL,
      node: process.version,
      external_requests_blocked: dom.blocked,
      summary: { pass, fail: all.length - pass, total: all.length, first_failing_check: firstFail ? firstFail.id : null },
      results: all,
    };
  } finally {
    removeWorktree(targetRoot);
    removeWorktree(baselineRoot);
  }
  for (const r of report.results) console.log(`[${r.status}] ${r.id} — ${r.detail}`);
  console.log(`\n대상 ${report.target_commit.slice(0, 7)}: ${report.summary.pass}/${report.summary.total} PASS, 첫 실패 검사: ${report.summary.first_failing_check || "없음"}, 외부 요청 차단 ${report.external_requests_blocked.length}건`);
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2) + "\n");
    console.log(`결과 저장: ${args.out}`);
  }
})().catch((e) => { console.error(e); process.exit(2); });

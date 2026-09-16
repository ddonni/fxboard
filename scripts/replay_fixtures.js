#!/usr/bin/env node
'use strict';

// 오늘의 진짜 정보판 — 공식 fixture 재생 검증기 (카드 3, T04-C12~C19, C26)
//
// adapter/reading-store.js에 ALEPH의 공개 fixture 9개를 공식 재생 순서대로 먹이고,
// 각 단계의 결과 상태를 fixture의 expected 블록과 대조해서 PASS/FAIL을 출력한다.
// 외부 네트워크를 전혀 쓰지 않는다 — fixture 자체가 합성 시험값이라서다.
//
// 사용법:
//   node scripts/replay_fixtures.js --fixtures-dir <공식 패키지의 fixtures 폴더 경로>
//
// exit code 0 = 전부 PASS, 1 = 하나라도 FAIL (CI 게이팅에도 쓸 수 있음)

const fs = require('fs');
const path = require('path');
const store = require('../adapter/reading-store.js');

function parseArgs(argv) {
  const args = { fixturesDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixtures-dir') args.fixturesDir = argv[++i];
  }
  return args;
}

function loadFixture(dir, filename) {
  const p = path.join(dir, filename);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function lastRow(state) {
  if (state.daily_readings.length === 0) return null;
  return state.daily_readings[state.daily_readings.length - 1];
}

function checkExpected(fixture, stateBefore, stateAfter) {
  const exp = fixture.expected;
  const problems = [];

  if (stateAfter.status.freshness !== exp.freshness) {
    problems.push(`freshness: got ${stateAfter.status.freshness}, expected ${exp.freshness}`);
  }
  if (stateAfter.status.error_code !== exp.error_code) {
    problems.push(`error_code: got ${stateAfter.status.error_code}, expected ${exp.error_code}`);
  }
  if (stateAfter.daily_readings.length !== exp.row_count) {
    problems.push(`row_count: got ${stateAfter.daily_readings.length}, expected ${exp.row_count}`);
  }
  const last = lastRow(stateAfter);
  const storedValue = last ? last.normalized_value : null;
  if (storedValue !== exp.stored_value) {
    problems.push(`stored_value: got ${storedValue}, expected ${exp.stored_value}`);
  }
  if ((stateAfter.last_delta ?? null) !== (exp.delta ?? null)) {
    problems.push(`delta: got ${stateAfter.last_delta}, expected ${exp.delta}`);
  }

  // preserve_last_good: 이번 단계에서 "새로 쓴 날짜"를 제외한 다른 모든 날짜의 행이
  // 이전 상태와 완전히 동일하게 남아있는지 확인한다 (값이 조용히 바뀌거나 사라지지 않았는지).
  if (exp.preserve_last_good) {
    const beforeOthers = stateBefore.daily_readings.filter(
      (row) => !(fixture.payload && row.record_date === fixture.payload.record_date && row.signal_id === fixture.payload.signal_id)
    );
    for (const beforeRow of beforeOthers) {
      const afterRow = stateAfter.daily_readings.find(
        (row) => row.record_id === beforeRow.record_id
      );
      if (!afterRow || afterRow.normalized_value !== beforeRow.normalized_value) {
        problems.push(`preserve_last_good violated for record_id=${beforeRow.record_id}`);
      }
    }
  }

  if (exp.record_date && last && last.record_date !== exp.record_date) {
    problems.push(`record_date: got ${last && last.record_date}, expected ${exp.record_date}`);
  }

  return problems;
}

function runSequence(label, fixtureFiles, dir, recordIds) {
  let state = store.resetEvaluationState();
  let allOk = true;
  console.log(`\n--- ${label} ---`);
  for (const filename of fixtureFiles) {
    const fixture = loadFixture(dir, filename);
    const before = state;
    const after = store.runFixture(before, fixture);
    const problems = checkExpected(fixture, before, after);

    if (fixture.expected.same_record_id_as) {
      const refId = recordIds[fixture.expected.same_record_id_as];
      const gotRow = lastRow(after);
      if (!refId || !gotRow || gotRow.record_id !== refId) {
        problems.push(`same_record_id_as: expected same record_id as ${fixture.expected.same_record_id_as}`);
      }
    }
    const gotRow = lastRow(after);
    if (gotRow) recordIds[fixture.fixture_id] = gotRow.record_id;

    const ok = problems.length === 0;
    allOk = allOk && ok;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${fixture.fixture_id} — ${fixture.description_ko}`);
    if (!ok) problems.forEach((p) => console.log(`         ! ${p}`));
    state = after;
  }
  return { allOk, finalState: state };
}

function main() {
  const { fixturesDir } = parseArgs(process.argv.slice(2));
  if (!fixturesDir) {
    console.error('사용법: node scripts/replay_fixtures.js --fixtures-dir <경로>');
    process.exit(2);
  }

  const recordIds = {};
  let allOk = true;

  // 1) 정상 저장 시퀀스: reset → D1-A → D1-B → D2
  {
    const { allOk: ok } = runSequence(
      '정상 저장 시퀀스 (T04-C20, C21)',
      ['normal-d1-a.json', 'normal-d1-b.json', 'normal-d2.json'],
      fixturesDir,
      recordIds
    );
    allOk = allOk && ok;
  }

  // 2) 5종 실패: 각각 reset → D1-A → D1-B → 실패 fixture
  const failureFiles = {
    'T04-TIMEOUT (느린 응답, C12)': 'timeout.json',
    'T04-AUTH-401 (401 거절, C13)': 'auth-401.json',
    'T04-RATE-429 (호출 제한, C14)': 'rate-429.json',
    'T04-OFFLINE (오프라인, C15)': 'offline.json',
    'T04-SCHEMA-BREAK (형식 변경, C16)': 'schema-break.json'
  };
  for (const [label, file] of Object.entries(failureFiles)) {
    const { allOk: ok } = runSequence(
      `실패 재생 — ${label}`,
      ['normal-d1-a.json', 'normal-d1-b.json', file],
      fixturesDir,
      { ...recordIds }
    );
    allOk = allOk && ok;
  }

  // 3) 복구 시퀀스: reset → D1-A → D1-B → TIMEOUT → RECOVER-D2
  {
    const { allOk: ok } = runSequence(
      '오류 뒤 복구 시퀀스 (T04-C19)',
      ['normal-d1-a.json', 'normal-d1-b.json', 'timeout.json', 'recover-d2.json'],
      fixturesDir,
      { ...recordIds }
    );
    allOk = allOk && ok;
  }

  console.log(`\n=== 전체 결과: ${allOk ? '모두 PASS' : '일부 FAIL'} ===`);
  process.exit(allOk ? 0 : 1);
}

main();

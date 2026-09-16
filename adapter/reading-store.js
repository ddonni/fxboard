'use strict';

/* global module */

// 오늘의 진짜 정보판 — 정규화/저장/상태전이 상태기계 (카드 3)
//
// ALEPH T04 공개 fixture 꾸러미(aleph-t04-real-information-board-public-contract-v2)에
// 포함된 참조 구현 adapter-reset.example.js를 바탕으로 이 저장소용으로 옮겨온 것입니다.
// 원본은 "그대로 복사해야 하는 라이브러리는 아니다"라고 명시하지만, 정확히 이 상태 전이를
// 재현하는 게 목적이라 로직은 대부분 그대로 유지하고 이 저장소 맥락에 맞게 주석만 다듬었습니다.
// (독립적으로 9개 공식 fixture를 모두 재생해 기대값과 일치하는지 scripts/replay_fixtures.js로
// 직접 검증했습니다 — README의 "카드 3" 절 참고.)
//
// 이 모듈은 signal_id 하나로 고정되어 있지 않습니다 — 실제 라이브 신호(JPY/KRW)든, 채점기가
// 넣는 합성 신호(aleph-demo-index)든 같은 정규화 스키마(normalized-reading.schema.json)를
// 만족하는 reading 객체라면 동일하게 처리합니다. 즉 이 파일이 "replay adapter"이자, 동시에
// 실제 신호에도 쓸 수 있는 저장 계층의 핵심입니다.

const NORMALIZED_KEYS = Object.freeze([
  'signal_id',
  'normalized_value',
  'unit',
  'source_name',
  'source_url',
  'source_time',
  'fetched_at',
  'record_timezone',
  'record_date'
]);

const ERROR_CODES = Object.freeze([
  'timeout',
  'auth',
  'rate_limit',
  'offline',
  'schema_error'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function kstDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('fetched_at must be a valid ISO-8601 date-time');
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function validateNormalizedReading(reading) {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
    throw new TypeError('normalized reading must be an object');
  }

  const actualKeys = Object.keys(reading).sort();
  const expectedKeys = [...NORMALIZED_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError(`normalized reading keys must be exactly: ${NORMALIZED_KEYS.join(', ')}`);
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(reading.signal_id) || reading.signal_id.length > 100) {
    throw new TypeError('signal_id is invalid');
  }
  if (typeof reading.normalized_value !== 'number' || !Number.isFinite(reading.normalized_value)) {
    throw new TypeError('normalized_value must be a finite number');
  }
  for (const field of ['unit', 'source_name']) {
    if (typeof reading[field] !== 'string' || reading[field].trim() === '') {
      throw new TypeError(`${field} must be a non-empty string`);
    }
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(reading.source_url);
  } catch {
    throw new TypeError('source_url must be an absolute URL');
  }
  if (sourceUrl.protocol !== 'https:') {
    throw new TypeError('source_url must use HTTPS');
  }

  if (reading.source_time !== null && Number.isNaN(new Date(reading.source_time).getTime())) {
    throw new TypeError('source_time must be a valid date-time or null');
  }
  if (Number.isNaN(new Date(reading.fetched_at).getTime())) {
    throw new TypeError('fetched_at must be a valid date-time');
  }
  if (reading.record_timezone !== 'Asia/Seoul') {
    throw new TypeError('record_timezone must be Asia/Seoul');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reading.record_date) || reading.record_date !== kstDate(reading.fetched_at)) {
    throw new TypeError('record_date must be the Asia/Seoul date derived from fetched_at');
  }

  return true;
}

function validateStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return false;
  if (status.freshness === 'fresh') return status.error_code === 'none';
  if (status.freshness === 'stale') return ERROR_CODES.includes(status.error_code);
  return false;
}

function resetEvaluationState() {
  return {
    schema_version: 'aleph-t04-evaluation-state-v1',
    daily_readings: [],
    current_reading: null,
    status: null,
    last_delta: null,
    last_comparison: {
      state: 'insufficient',
      direction: null,
      magnitude: null,
      unit: null
    },
    last_run: null,
    sequence: 0
  };
}

function recordIdFor(reading) {
  return `demo-${reading.signal_id}-${reading.record_date}`;
}

function comparisonFor(rows, current) {
  const previous = rows
    .filter((row) => row.signal_id === current.signal_id && row.record_date < current.record_date)
    .sort((left, right) => right.record_date.localeCompare(left.record_date))[0];
  if (!previous) {
    return { state: 'insufficient', direction: null, magnitude: null, unit: null };
  }
  if (previous.unit !== current.unit) {
    return { state: 'unit_mismatch', direction: null, magnitude: null, unit: null };
  }
  const signed = current.normalized_value - previous.normalized_value;
  return {
    state: 'comparable',
    direction: signed > 0 ? 'increase' : signed < 0 ? 'decrease' : 'unchanged',
    magnitude: Math.abs(signed),
    unit: current.unit
  };
}

function applySuccessfulReading(inputState, reading, runMeta = {}) {
  validateNormalizedReading(reading);
  const state = clone(inputState);
  const existingIndex = state.daily_readings.findIndex(
    (row) => row.signal_id === reading.signal_id && row.record_date === reading.record_date
  );
  const existing = existingIndex >= 0 ? state.daily_readings[existingIndex] : null;
  const row = {
    record_id: existing ? existing.record_id : recordIdFor(reading),
    signal_id: reading.signal_id,
    record_date: reading.record_date,
    normalized_value: reading.normalized_value,
    unit: reading.unit,
    first_fetched_at: existing ? existing.first_fetched_at : reading.fetched_at,
    last_fetched_at: reading.fetched_at,
    reading: clone(reading)
  };

  if (existingIndex >= 0) state.daily_readings[existingIndex] = row;
  else state.daily_readings.push(row);
  state.daily_readings.sort((left, right) => left.record_date.localeCompare(right.record_date));

  state.current_reading = clone(reading);
  state.status = { freshness: 'fresh', error_code: 'none' };
  state.last_comparison = comparisonFor(state.daily_readings, row);
  state.last_delta = state.last_comparison.magnitude;
  state.sequence += 1;
  state.last_run = {
    fixture_id: runMeta.fixture_id || null,
    virtual_now: runMeta.virtual_now || reading.fetched_at,
    outcome: 'success',
    error_code: 'none',
    retry_after_seconds: null
  };
  return state;
}

function applyError(inputState, errorCode, runMeta = {}) {
  if (!ERROR_CODES.includes(errorCode)) {
    throw new TypeError(`unsupported error code: ${errorCode}`);
  }
  const state = clone(inputState);
  state.status = { freshness: 'stale', error_code: errorCode };
  state.sequence += 1;
  state.last_run = {
    fixture_id: runMeta.fixture_id || null,
    virtual_now: runMeta.virtual_now || null,
    outcome: 'error',
    error_code: errorCode,
    retry_after_seconds: runMeta.retry_after_seconds ?? null
  };
  return state;
}

function runFixture(inputState, fixture) {
  const meta = {
    fixture_id: fixture.fixture_id,
    virtual_now: fixture.virtual_now,
    retry_after_seconds: fixture.transport.headers['retry-after']
      ? Number(fixture.transport.headers['retry-after'])
      : null
  };

  if (fixture.transport.mode === 'timeout') return applyError(inputState, 'timeout', meta);
  if (fixture.transport.mode === 'offline') return applyError(inputState, 'offline', meta);
  if (fixture.transport.status === 401 || fixture.transport.status === 403) {
    return applyError(inputState, 'auth', meta);
  }
  if (fixture.transport.status === 429) return applyError(inputState, 'rate_limit', meta);
  if (fixture.transport.status >= 200 && fixture.transport.status < 300) {
    try {
      return applySuccessfulReading(inputState, fixture.payload, meta);
    } catch {
      return applyError(inputState, 'schema_error', meta);
    }
  }
  return applyError(inputState, 'schema_error', meta);
}

module.exports = {
  ERROR_CODES,
  NORMALIZED_KEYS,
  applyError,
  applySuccessfulReading,
  comparisonFor,
  kstDate,
  resetEvaluationState,
  runFixture,
  validateNormalizedReading,
  validateStatus
};

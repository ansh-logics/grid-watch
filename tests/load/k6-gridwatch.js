/**
 * GridWatch k6
 *
 * Smoke (default): low load, 100 readings/request — safe for local Docker.
 *   K6_PROFILE=smoke SENSOR_ID=<uuid> ZONE_ID=<uuid> k6 run tests/load/k6-gridwatch.js
 *
 * Full (~5.5m): steady + spike + history — use after smoke passes; K6_PROFILE=full
 *   READING_COUNT=1000 STEADY_RPM=10 k6 run -e K6_PROFILE=full -e SENSOR_ID=... -e ZONE_ID=...
 *
 * History p95 default 600ms (override HISTORY_P95_MS). Repository paginates ids first so large
 * sensors stay fast; stricter: HISTORY_P95_MS=300 ...
 *
 * Do not use placeholders: SENSOR_ID must be a real sensor row (FK on ingest).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const ingestDuration = new Trend('ingest_duration_ms');
const ingestFailures = Counter('ingest_failures');
const historyDuration = new Trend('history_duration_ms');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SENSOR_ID = (__ENV.SENSOR_ID || '').trim();
const ZONE_ID = (__ENV.ZONE_ID || '').trim();
const USER_ID = __ENV.X_USER_ID || '00000000-0000-0000-0000-000000000001';
const PROFILE = (__ENV.K6_PROFILE || 'smoke').toLowerCase();
const READING_COUNT = __ENV.READING_COUNT ? parseInt(__ENV.READING_COUNT, 10) : PROFILE === 'smoke' ? 100 : 1000;
/** Full profile: history p95 SLO (ms). Default 600. */
const HISTORY_P95_MS = __ENV.HISTORY_P95_MS ? parseInt(__ENV.HISTORY_P95_MS, 10) : 600;
/** Days of history window for GET .../history (default 30). */
const HISTORY_WINDOW_DAYS = __ENV.HISTORY_WINDOW_DAYS ? parseInt(__ENV.HISTORY_WINDOW_DAYS, 10) : 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readingBatch(n, baseTs) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      sensor_id: SENSOR_ID,
      timestamp: new Date(baseTs + i * 1000).toISOString(),
      voltage: 220 + (i % 10) * 0.1,
      current: 10,
      temperature: 25,
      status_code: 200,
    });
  }
  return out;
}

function scopedHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-user-id': USER_ID,
    'x-user-role': 'operator',
    'x-user-zone': ZONE_ID,
  };
}

/** k6 default HTTP timeout is 60s — raise if you intentionally stress long requests */
const HTTP_PARAMS = {
  timeout: __ENV.HTTP_TIMEOUT || '120s',
  headers: { 'Content-Type': 'application/json' },
};

const smokeOptions = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: __ENV.SMOKE_VUS ? parseInt(__ENV.SMOKE_VUS, 10) : 3,
      duration: __ENV.SMOKE_DURATION || '1m',
      exec: 'smokeScenario',
      tags: { scenario: 'smoke' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.1'],
  },
};

const fullOptions = {
  scenarios: {
    steady_ingest: {
      executor: 'constant-arrival-rate',
      rate: __ENV.STEADY_RPM ? parseInt(__ENV.STEADY_RPM, 10) : 10,
      timeUnit: '1m',
      duration: __ENV.STEADY_DURATION || '2m',
      preAllocatedVUs: 20,
      maxVUs: 80,
      exec: 'steadyIngest',
      startTime: '0s',
      tags: { scenario: 'steady_ingest' },
    },
    spike_ingest: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 40,
      stages: [
        { duration: '30s', target: 2 },
        { duration: '1m', target: 15 },
        { duration: '30s', target: 2 },
      ],
      exec: 'spikeIngest',
      startTime: '2m30s',
      tags: { scenario: 'spike_ingest' },
    },
    burst_history: {
      executor: 'constant-vus',
      vus: __ENV.HISTORY_VUS ? parseInt(__ENV.HISTORY_VUS, 10) : 5,
      duration: __ENV.HISTORY_DURATION || '1m',
      exec: 'burstHistory',
      startTime: '4m30s',
      tags: { scenario: 'burst_history' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    ingest_duration_ms: ['p(95)<200'],
    history_duration_ms: [`p(95)<${HISTORY_P95_MS}`],
  },
};

export const options = PROFILE === 'full' ? fullOptions : smokeOptions;

export function setup() {
  if (!SENSOR_ID || !UUID_RE.test(SENSOR_ID)) {
    throw new Error(
      'Invalid SENSOR_ID. Use a real sensor UUID from Postgres (no quotes). Example:\n' +
        '  SENSOR_ID=550e8400-e29b-41d4-a716-446655440000 k6 run -e K6_PROFILE=smoke tests/load/k6-gridwatch.js'
    );
  }
  if (PROFILE === 'smoke' && (!ZONE_ID || !UUID_RE.test(ZONE_ID))) {
    console.warn(
      'ZONE_ID missing or invalid — history checks in smokeScenario will be skipped. Set ZONE_ID for the sensor\'s zone.'
    );
  }
  return { sensorId: SENSOR_ID };
}

export function smokeScenario() {
  const body = JSON.stringify(readingBatch(READING_COUNT, Date.now()));
  const res = http.post(`${BASE_URL}/ingest`, body, HTTP_PARAMS);
  ingestDuration.add(res.timings.duration);
  const ingestOk = check(res, {
    'ingest 2xx': (r) => r.status === 202 || r.status === 200,
  });
  if (!ingestOk) ingestFailures.add(1);

  if (ZONE_ID && UUID_RE.test(ZONE_ID)) {
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=50&offset=0`;
    const url = `${BASE_URL}/sensors/${SENSOR_ID}/history?${qs}`;
    const hres = http.get(url, { ...HTTP_PARAMS, headers: { ...HTTP_PARAMS.headers, ...scopedHeaders() } });
    historyDuration.add(hres.timings.duration);
    check(hres, { 'history 200': (r) => r.status === 200 });
  }
  sleep(1);
}

export function steadyIngest() {
  const body = JSON.stringify(readingBatch(READING_COUNT, Date.now()));
  const res = http.post(`${BASE_URL}/ingest`, body, HTTP_PARAMS);
  ingestDuration.add(res.timings.duration);
  const ok = check(res, {
    'ingest 2xx': (r) => r.status === 202 || r.status === 200,
  });
  if (!ok) ingestFailures.add(1);
  sleep(0.05);
}

export function spikeIngest() {
  steadyIngest();
}

export function burstHistory() {
  if (!ZONE_ID || !UUID_RE.test(ZONE_ID)) {
    return;
  }
  const to = new Date();
  const from = new Date(to.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=100&offset=0`;
  const url = `${BASE_URL}/sensors/${SENSOR_ID}/history?${qs}`;
  const res = http.get(url, { ...HTTP_PARAMS, headers: { ...HTTP_PARAMS.headers, ...scopedHeaders() } });
  historyDuration.add(res.timings.duration);
  check(res, {
    'history 200': (r) => r.status === 200,
  });
  sleep(0.1);
}

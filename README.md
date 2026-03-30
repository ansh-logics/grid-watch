# GridWatch

Real-time infrastructure anomaly detection platform:
- Node.js + TypeScript backend (`backend/`)
- PostgreSQL + row-level security (RLS) (`init.sql`)
- Async ingestion + anomaly detection via BullMQ + Redis (`backend/src/queue/*`, `backend/src/workers/anomaly-worker.ts`)
- Cron workers for “silent sensor” + escalation (`backend/src/workers/cron.ts`)
- Real-time dashboard updates via SSE (Server-Sent Events) with Redis Pub/Sub fan-out (`backend/src/real-time/sse.ts`, `frontend/src/hooks/use-zone-sse.ts`)

---

## 1) Setup — one-command instructions to get the system running

### Run everything (DB + Redis + backend + frontend)

```bash
docker compose -f docker-compose-dev.yml up --build
```

### URLs

- Backend API: `http://localhost:3000`
- Frontend: `http://localhost:5173`

### Optional environment knobs (backend)

- `INGEST_API_KEY`: require `X-Api-Key` (or `Authorization: Bearer`) on `POST /ingest`
- `DISABLE_QUEUES=1`: skip BullMQ enqueue (useful for isolated API testing)
- `DISABLE_REDIS_IDEMPOTENCY=1`: use in-memory idempotency (tests/dev only)

---

## 2) Architecture — how data flows (ingest → anomaly detection → alert → dashboard update)

### High-level flow

- **Ingest**: `POST /ingest` validates payload + idempotency, bulk-inserts readings to Postgres, then enqueues an anomaly detection job.
- **Detect**: BullMQ worker fetches the newly inserted readings, evaluates rules, writes `anomalies` and (if not suppressed) `alerts`, and updates `sensors.current_state`.
- **Alert lifecycle**: alerts can be acknowledged/resolved; transitions are audited.
- **Real-time update**: whenever a sensor’s state changes (or a sensor goes “silent”), the worker broadcasts a zone event; backend fans out to connected dashboards over SSE; frontend updates its cached sensor list immediately.

### Diagram (logical)

```mermaid
flowchart LR
  S[Sensor] -->|HTTP batch| I[POST /ingest]
  I -->|bulk insert| PG[(Postgres)]
  I -->|enqueue detect-batch| Q[(BullMQ queue)]
  Q --> W[anomaly-worker]
  W -->|read readings + rules| PG
  W -->|insert anomalies/alerts| PG
  W -->|update sensors.current_state| PG
  W -->|publish zone event| R[(Redis Pub/Sub)]
  R --> API[SSE manager]
  API -->|SSE /events/zone/:zoneId| UI[Dashboard]
  UI -->|update react-query cache| UI
```

---

## 3) Schema Decisions — why the database is structured this way

The schema is designed around three requirements: **time-series reads**, **auditable alert lifecycle**, and **zone-based isolation via RLS**.

### Key tables and relationships

- **`zones` → `sensors` → `readings`**
  - `readings` is append-only time-series telemetry.
  - `sensors.current_state` and `sensors.last_reading_at` are a “hot” projection for fast dashboards (no expensive aggregation required for the main list view).
- **`rules`**
  - Rules are per-sensor (simple to reason about and evaluate in the worker).
  - `rules.config` is `jsonb` to allow multiple rule types without schema churn.
- **`anomalies` + `alerts`**
  - `anomalies` capture “a rule triggered” (can exist even when suppressed).
  - `alerts` represent actionable items (only created when not suppressed), with `status` tracked explicitly.
- **`alert_audit_log`**
  - Every status transition is written to an audit table to keep the alert lifecycle explainable.
- **`suppressions`**
  - Time-bounded suppression windows prevent noisy alerts during maintenance.
- **`users` + `user_zone_access`**
  - `users.zone_id` supports “default” zone scoping.
  - `user_zone_access` supports multi-zone operators and is also used to authorize SSE subscriptions.

### Indexes (the ones that matter for the core paths)

- **Time-series history**: `readings(sensor_id, timestamp)` (`idx_readings_sensor_time`)
  - Optimizes “show history for sensor X between from/to ordered by time”.
- **Global time access**: `readings(timestamp)` (`idx_readings_timestamp`)
  - Useful for operator-wide time windows and maintenance queries.
- **Alert filtering**: `alerts(status, severity)` (`idx_alerts_status_severity`)
  - Powers “open critical” / “open warning” dashboards and escalation scans.
- **Access mapping**: `user_zone_access(user_id)` and `user_zone_access(zone_id)`
  - Supports fast “which zones can this user see?” and “who can see this zone?” queries.

### Why RLS

RLS policies in `init.sql` enforce that an operator can only see data in their zone(s), while supervisors can see across zones. Backend code sets per-request session context using `set_config(...)` and uses a dedicated “internal” context for workers (`withInternalTransaction`) so background jobs can operate across zones safely.

---

## 4) Real-Time Design — how sensor state changes reach the dashboard without polling

- **Technology**: SSE (Server-Sent Events) endpoint `GET /events/zone/:zoneId` (`backend/src/app.ts`)
- **Fan-out architecture**:
  - Workers publish a lightweight event to Redis Pub/Sub channel `zone-events` (`backend/src/real-time/sse.ts`).
  - The API process subscribes and writes the event to all connected SSE clients for that zone.
- **Frontend integration**:
  - `frontend/src/hooks/use-zone-sse.ts` uses `@microsoft/fetch-event-source` to maintain a resilient SSE connection.
  - On each message, the hook updates the `@tanstack/react-query` cache for the zone’s sensor list, so the UI re-renders immediately without polling.

This design keeps the dashboard responsive while avoiding periodic “pull” requests.

---

## 5) What You Finished and What You Cut — explicit status

### Working (end-to-end)

- **Ingest API**: validates payload size, bulk inserts, idempotency support with conflict on key reuse + different body (`backend/src/services/ingest.service.ts`)
- **Async anomaly detection**:
  - BullMQ queue + worker
  - Rule types implemented: `threshold`, `rate_of_change` (`backend/src/workers/anomaly-worker.ts`)
- **Suppressions**: suppressed anomalies don’t generate alerts (`backend/src/workers/anomaly-worker.ts`)
- **Silent sensor detection (cron)**: marks sensors as `silent` after inactivity and creates alert (`backend/src/workers/cron.ts`)
- **Escalation cron**: records escalation for stale open critical alerts (`backend/src/workers/cron.ts`)
- **RLS + scoped queries**: request-scoped access enforcement and worker internal context (`init.sql`, `backend/src/db/index.ts`)
- **SSE authorization gate**: operators cannot subscribe to zones they don’t have access to (`backend/src/app.ts`)
- **Integration tests**: ingest idempotency, alert lifecycle transitions, history API basics (`backend/tests/integration/*`)

### Stubbed / incomplete / known issues (important)

- **SSE event payload contract mismatch**:
  - Backend broadcasts `{ sensorId, newState, alertId }`
  - Frontend hook expects `{ sensor_id, state, timestamp }`
  - Result: real-time UI updates are not fully wired unless the payloads are aligned.
- **Multi-instance SSE edge routing**:
  - Redis Pub/Sub distributes events, but **SSE connections are stored in-memory per API instance** (no shared connection registry).
  - In production behind a load balancer, this requires sticky sessions or a dedicated SSE gateway.
- **Anomaly semantics are intentionally simple**:
  - No deduplication/windowing (“same alert already open”), no advanced statistics/seasonality models, no per-sensor baselines.
- **Operational hardening gaps**:
  - No DLQ inspection UI, limited observability (metrics/tracing), and limited failure-mode tests (Redis outage, worker lag).

---

## 6) The Three Hardest Problems

1. **RLS + background workers**
   - Choice: enforce zone isolation in Postgres via RLS, but allow workers to run with an explicit “internal” DB session context.
   - Why: it keeps the security boundary in the database, while still supporting cross-zone internal automation safely.

2. **Load testing + Grafana (learning curve)**
   - Choice: use a k6 script (`tests/load/k6-gridwatch.js`) to generate realistic ingest traffic and then visualize what was happening in Grafana.
   - Why: I’d never used Grafana before this. I had to learn it quickly and implement dashboards/queries while the system was changing, and I used AI here to help me learn faster. There was a lot of trial-and-error to get useful panels (and to separate “my code is slow” from “my test is unrealistic”).

3. **Real-time fan-out without polling**
   - Choice: SSE for client delivery + Redis Pub/Sub for cross-process broadcast.
   - Why: SSE is simple, HTTP-friendly, and works well for “stream updates to a list view” while Pub/Sub decouples workers from API connection handling.

---

## 7) Production Gap — one thing I would do differently with a week

I’d implement a **versioned, validated event contract** for real-time updates (plus an outbox-style persistence option), so:
- backend and frontend can’t drift on payload shape,
- events can be replayed for late-joining dashboards,
- and multi-instance delivery can be hardened (gateway + sticky-less fanout).

---

## Authentication and authorization

GridWatch uses a dedicated auth middleware (`backend/src/middleware/auth.ts`) that:
- accepts JWT bearer tokens when `JWT_SECRET` is configured
- falls back to header-based identity (`x-user-id`, `x-zone-id`) in development mode
- validates user existence from DB
- maps user-to-zone authorization through:
  - `users.zone_id`
  - `user_zone_access` table (multi-zone operators)
- attaches a normalized context onto `req.authUser`

### JWT claim shape (supported)

- `sub` or `user_id` (required)
- optional role and zone claims are accepted but DB remains source of truth

---

## Automated tests

Test stack:
- Vitest
- Supertest
- PostgreSQL integration database

### Covered scenarios

1. Ingest API (`tests/integration/ingest.api.test.ts`)
   - valid batch insert
   - invalid payload handling
   - idempotency behavior
   - same key + different body returns `409`

2. Alert lifecycle (`tests/integration/alerts.lifecycle.test.ts`)
   - `open -> acknowledged -> resolved`
   - invalid transitions fail

3. History API (`tests/integration/history.api.test.ts`)
   - pagination (`limit`, `offset`)
   - response structure

### Run tests

Create a dedicated test DB first (recommended name must end with `_test`):

```bash
createdb gridwatch_test
```

Then run:

```bash
cd backend
TEST_DATABASE_URL=postgres://gridwatch_user:gridwatch_password@localhost:5432/gridwatch_test npm test
```

Safety guard: tests abort if DB name does not end with `_test`.

---

## Migrations and schema management

### Files

- Base schema snapshot: `init.sql`
- Incremental migrations: `backend/migrations/*.sql`
- Migration runner: `backend/src/scripts/migrate.ts`

### Fresh setup (new database)

```bash
psql "$DATABASE_URL" -f init.sql
cd backend
npm run migrate
```

### Upgrade existing DB

```bash
cd backend
DATABASE_URL=postgres://... npm run migrate
```

Current migration:
- `001_add_user_zone_access.sql`: introduces multi-zone mapping table and RLS policy.

### Re-applying RLS safely

RLS policy updates are done through idempotent migration SQL:
- `DROP POLICY IF EXISTS ...`
- `CREATE POLICY ...`

This prevents drift while keeping production upgrades repeatable.

---

## Known limitations

- Header auth fallback is still supported for development and non-token clients.
- Idempotency fallback in test mode uses in-memory store; production should keep Redis available.
- SSE currently keeps in-memory connection maps per node (events distribute via Redis, connections do not).

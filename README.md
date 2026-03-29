# GridWatch

Real-time infrastructure anomaly detection platform with:
- Node.js + TypeScript API
- PostgreSQL with row-level security (RLS)
- async ingestion pipeline (BullMQ + Redis)
- anomaly + cron workers
- SSE-based zone updates

## Quick start

### 1) Start dependencies

```bash
docker compose -f docker-compose-dev.yml up -d db redis
```

### 2) Install backend dependencies

```bash
cd backend
npm install
```

### 3) Start backend

```bash
npm run dev
```

## Authentication and authorization

GridWatch now uses a dedicated auth middleware (`backend/src/middleware/auth.ts`) that:
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

## SSE security improvements

`GET /events/zone/:zoneId` now:
- requires authenticated user context
- validates zone access before opening stream
- blocks operator subscriptions outside authorized zones
- keeps supervisor access across zones

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

## Production improvements

- **Auth hardening**: centralized auth middleware with optional JWT validation.
- **SSE authorization**: DB-backed user-zone validation before subscribing.
- **Ingestion SQL safety**: parameterized bulk insert (`unnest`) instead of dynamic SQL formatting.
- **Idempotency hardening**: body hash check; reusing key with different body is rejected.
- **Rate limiting**: lightweight middleware for ingest and authenticated routes.
- **Testability**: app bootstrapping split from server startup (`createApp()`), enabling integration tests without worker startup.

### Planned next steps (recommended for production scale)

- JWT key rotation + JWKS endpoint support.
- Redis Pub/Sub fan-out from dedicated edge nodes for multi-instance SSE.
- Persist idempotency records in Postgres for cross-instance durability.
- Add distributed rate limiting (Redis-based token bucket).

## Testing strategy

- Primary focus is API contract and critical workflow regression protection.
- Tests are integration-heavy and hit real Postgres behavior (RLS + constraints).
- Not covered yet:
  - worker internals (anomaly/cron) under load
  - SSE stream longevity and reconnect semantics
  - chaos/failure-path tests (Redis downtime, partial network partition)

## Migration and deployment notes

- Deploy order:
  1. apply DB migration(s)
  2. deploy backend with new middleware
  3. rotate clients to JWT mode (or keep header mode in dev)
- Rollback:
  - app rollback is safe if migration is backward-compatible
  - for schema rollback, use explicit reverse SQL migration scripts

## Known limitations

- Header auth fallback is still supported for development and non-token clients.
- Idempotency fallback in test mode uses in-memory store; production should keep Redis available.
- SSE currently keeps in-memory connection maps per node (Redis pub/sub distributes events, but connection state is local).

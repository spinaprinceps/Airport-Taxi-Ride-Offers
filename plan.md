# Build progress — Airport Taxi Ride Offers

Living log of what is done. Update at the end of every step. The full spec is the
build plan doc ("Airport Taxi Ride Offers — Build Plan", 13 Nov 2026); this file
only records progress, decisions and deviations.

## Working agreement

- Prajna owns `backend/`, `docker-compose.yml`, DB, rule engine, tests. Partner owns `frontend/`.
- Claude writes code and runs tests locally; **Claude never runs git push/commit** —
  it gives the commands and Prajna runs them.
- Repo: https://github.com/spinaprinceps/Airport-Taxi-Ride-Offers.git (branch `main`).
- Commit message format: `S3 backend: supplier dashboard (R4-R6)`.
- Tests first for every slice: write tests, see them fail, code until green.

## Rules from the build plan (always hold)

- `data/` is copied in once from the pack and **never edited**. The app reads it; the loader
  inserts it into Postgres at every boot (idempotent upserts / `ON CONFLICT DO NOTHING`).
- Slices go in order; the next slice starts only after the current slice's **Done when** passes.
- Frontend never blocks a value; all rules R1–R9 live in the backend.
- Every refusal shows the rule code (R1–R9) and the numbers involved.
- Date-times are local strings `2027-04-10T11:30`; `Z`/offset → 400. Money = whole rupees.
- No AI/LLM call anywhere in the app.
- Push at the end of every slice and at least once an hour.

## Environment

- Windows 11, Node 24 locally (Docker image uses Node 20), Docker 29, Postgres 16-alpine.
- DB: user/pass/db `taxi`/`taxi`/`taxi`; test DB `taxi_test` (created by
  `backend/db-init/01-test-db.sql` on first volume init). `btree_gist` verified available.
- Dev: `docker compose up -d db`, then `npm run dev` in `backend/` (port 4000).
- Tests: `npm test` in `backend/` (Vitest 5 + supertest; tests use `taxi_test`).
- `docker compose up --build` needs `frontend/Dockerfile` (partner); until then use
  `docker compose up db api`.

## Status by slice

| Slice | Status | Notes |
| --- | --- | --- |
| S0 setup | **In progress** | Skeleton done and pushed (`66b6144`). Waiting on `data/` pack for schema + loader + `GET /api/suppliers`. |
| S1 catalog | Not started | |
| S2 requests | Partly started | Pure rules `hours.js` and `intervals.js` done with tests (not yet committed). |
| S3 dashboard | Not started | |
| S4 offers | Not started | |
| S5 offer list / reject | Not started | |
| S6 booking | Not started | |
| S7 booking summary | Not started | |
| S8 change request | Not started | |
| S9 supplier decides | Not started | |
| S10 hardening | Not started | |

## Done so far

### S0 (part 1) — committed `66b6144`
- `docker-compose.yml`: `db` (pgdata volume, healthcheck, port 5432), `api` (waits for db healthy,
  mounts `./data:/data:ro`, port 4000), `web` (build `./frontend`, 8080 -> 80).
- `backend/Dockerfile`, `.dockerignore`, root `.gitignore`.
- `src/config.js` — constants (MIN_PICKUP_GAP_MIN=60, BUSY_DRIVE_FACTOR=2, ARRIVAL_AIRPORTS, POLL_MS) + PORT, DATABASE_URL, DATA_DIR.
- `src/db.js` — pool, `query`, `withTransaction(fn)`; type parsers: timestamp(1114) -> `"YYYY-MM-DDTHH:MM"` string,
  bigint(20) -> number, numeric(1700) -> number.
- `src/time.js` — `isLocalDateTime`, `parse`, `format`, `addMinutes`, `hhmm`, `pretty` ("10 Apr 11:00").
- `src/errors.js` — `AppError`, `validation`/`forbidden`/`notFound`/`conflict`/`ruleViolation`, `v(rule, field, message)`.
- `src/app.js` — `createApp()`, `GET /api/health`, `/api` 404, error handler (AppError, ZodError -> 400, bad JSON -> 400).
- `src/server.js` — listens; schema + loader to be wired in.
- Tests: `test/api/health.test.js`, `test/rules/time.test.js`.

### S2 pure rules (early) — not yet committed
- `src/rules/hours.js` — `isOpenAt(from, until, hhmm)`, inclusive, handles midnight crossing, accepts HH:MM:SS.
- `src/rules/intervals.js` — `overlaps(aStart, aEnd, bStart, bEnd)`, half-open.
- Tests: `test/rules/hours.test.js`, `test/rules/intervals.test.js` (plan's cases: Sakura, Marina, 00:00–23:59, back-to-back).

Test count: 12 passing.

## Implementation decisions (beyond the build plan)

- Timestamps are parsed in `db.js` straight to `"YYYY-MM-DDTHH:MM"` (not the raw PG `"YYYY-MM-DD HH:MM:SS"`),
  so every layer sees the API format.
- `isLocalDateTime` accepts an optional `:SS`; anything with `Z` or an offset is refused.
- Rule message dates use `pretty()` → "10 Apr 11:00".

## Next up

1. Copy the data pack into `data/` (`catalog/`, `problem-2/`), byte-for-byte.
2. Inspect file formats → write `schema.sql` (reference tables + 5 app tables + `ride_request_seq`).
3. `loader.js` (upserts, seed busy times, seed requests, skip-and-log bad rows), wire into `server.js`.
4. `GET /api/suppliers` + tests (counts: 10 airports, 469 flights, 49 hotels, 33 routes, 11 companies,
   28 vehicles, 6 busy times, 3 requests; idempotent reload; 11 suppliers, first TX-JP-01).

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

## Data pack

- Source: `C:\Users\HP\Desktop\hackathon-problem-2-airport-taxi-offers\` (also has
  `DATA_DICTIONARY.md`, `problem-2-airport-taxi-offers.md`, `README.md`).
- Copied `data/` into the repo byte-for-byte (SHA-256 verified, 7 files):
  - `data/catalog/airports.json` (10), `flights.json` (469), `hotels.json` (49)
  - `data/problem-2/taxi_companies.json` (11 suppliers, 28 cars), `routes.json` (33),
    `booked_rides.json` (6), `open_requests.json` (3)
- File quirks: flight times have seconds (`2027-04-10T10:30:00`) → loader cuts to minutes.
  Indian airports have no `serves_cities`; ITM has `[]`. Seed request field is `pickup` (not `pickup_at`).

## Environment

- Windows 11, Node 24 locally (Docker image uses Node 20), Docker 29, Postgres 16-alpine.
- DB: user/pass/db `taxi`/`taxi`/`taxi`; test DB `taxi_test` (created by
  `backend/db-init/01-test-db.sql` on first volume init). `btree_gist` verified available.
- Dev: `docker compose up -d db`, then `npm run dev` in `backend/` (port 4000).
- Tests: `npm test` in `backend/` (Vitest 5 + supertest; API tests reset `taxi_test` via
  `test/helpers/db.js` → `resetDatabase()` = drop schema, applySchema, loadData).
- `docker compose up --build` needs `frontend/Dockerfile` (partner); until then use
  `docker compose up -d --build db api`.

## Status by slice

| Slice | Backend | Frontend | Notes |
| --- | --- | --- | --- |
| S0 setup | **Done** | Partner | Done-when verified in Docker (backend side): boot loads data, 11 suppliers, restart keeps counts. |
| S1 catalog | Next | | |
| S2 requests | Pure rules done early | | `hours.js`, `intervals.js` + tests. |
| S3 dashboard | Not started | | |
| S4 offers | Not started | | |
| S5 offer list / reject | Not started | | |
| S6 booking | Not started | | |
| S7 booking summary | Not started | | |
| S8 change request | Not started | | |
| S9 supplier decides | Not started | | |
| S10 hardening | Not started | | |

## Done so far

### S0 part 1 — committed `66b6144`
- `docker-compose.yml`: `db` (pgdata volume, healthcheck, port 5432), `api` (waits for db healthy,
  mounts `./data:/data:ro`, port 4000), `web` (build `./frontend`, 8080 -> 80).
- `backend/Dockerfile`, `.dockerignore`, root `.gitignore`.
- `src/config.js` — constants (MIN_PICKUP_GAP_MIN=60, BUSY_DRIVE_FACTOR=2, ARRIVAL_AIRPORTS, POLL_MS) + PORT, DATABASE_URL, DATA_DIR.
- `src/db.js` — pool, `query`, `withTransaction(fn)`; type parsers: timestamp(1114) -> `"YYYY-MM-DDTHH:MM"` string,
  bigint(20) -> number, numeric(1700) -> number.
- `src/time.js` — `isLocalDateTime`, `parse`, `format`, `addMinutes`, `hhmm`, `pretty` ("10 Apr 11:00").
- `src/errors.js` — `AppError`, `validation`/`forbidden`/`notFound`/`conflict`/`ruleViolation`, `v(rule, field, message)`.
- `src/app.js` — `createApp()`, `GET /api/health`, `/api` 404, error handler (AppError, ZodError -> 400, bad JSON -> 400).

### S0 part 2 — schema, loader, suppliers (not yet committed)
- `data/` copied in.
- `src/schema.sql` — run at every boot by `applySchema()` in `db.js`.
  - Reference: `airports`, `airport_cities`, `flights` (`from_airport`, `to_airport`, `departure_at`, `arrival_at`),
    `hotels`, `routes` (PK airport+city+area), `companies` (+`sort_order` = file order), `company_airports`
    (+`sort_order`), `company_areas`, `vehicles` (+`sort_order`).
  - App: `ride_requests` (all named checks, plus `rr_route_fk` → routes), `offers`, `bookings`,
    `vehicle_busy_times` (EXCLUDE gist `vehicle_busy_no_overlap`, `[)`), `change_requests`; sequence `ride_request_seq` from 1001.
  - Partial uniques are indexes: `offers_one_booked_per_request`, `cr_one_pending_per_booking`.
- `src/loader.js` — `loadData(dataDir)`: one transaction, bulk `jsonb_to_recordset` inserts; reference data upserted;
  seed busy times `ON CONFLICT (ride_id) DO NOTHING`; seed requests `ON CONFLICT (request_id) DO NOTHING` with
  airport/city/area/drive_minutes filled from flight+hotel+route; bad seed rows skipped + logged.
- `src/server.js` — boot: applySchema → loadData → listen.
- `GET /api/suppliers` — `repos/catalog.js` → `services/catalog.js` → `routes/catalog.js`; file order; airports in file order.
- `errors.js` — added `asyncRoute(fn)` wrapper (Express 4 does not catch async errors).
- Tests: `test/api/s0-load.test.js` (counts, idempotent reload, seed request fill, busy times exact,
  airport_cities, overlap constraint 23P01, back-to-back allowed, suppliers contract).

### S2 pure rules (built early, while waiting for data) — not yet committed
- `src/rules/hours.js` — `isOpenAt(from, until, hhmm)`, inclusive, handles midnight crossing, accepts HH:MM:SS.
- `src/rules/intervals.js` — `overlaps(aStart, aEnd, bStart, bEnd)`, half-open.

Test count: **20 passing**.

## Implementation decisions (beyond the build plan)

- Timestamps are parsed in `db.js` straight to `"YYYY-MM-DDTHH:MM"` (not the raw PG `"YYYY-MM-DD HH:MM:SS"`),
  so every layer sees the API format.
- `isLocalDateTime` accepts an optional `:SS`; anything with `Z` or an offset is refused.
- Rule message dates use `pretty()` → "10 Apr 11:00".
- `created_at` columns use UTC wall-clock (`now() AT TIME ZONE 'UTC'`); offers/changes use `clock_timestamp()`
  so two inserts in one transaction still order by creation time.
- Supplier list order = order in `taxi_companies.json` (so TX-JP-01 is first, as the plan's test expects).
- Seed requests are loaded as-is (not re-validated against R1–R3).

## Next up — S1 backend (choose flight and hotel, see price range)

1. Tests first: `GET /api/flights` (240, none to BLR/DEL/BOM/MAA/ITM, sorted by arrival), `GET /api/hotels` (49),
   `GET /api/price-range?flightId=FL-401&hotelId=HTL-TYO-004` → contract JSON; FL-401 + HTL-OSA-001 → 422 R1;
   FL-999 → 404.
2. `rules/requestRules.js` → `checkAirportServesCity(airport, hotel)`; extend `services/catalog.js`, `routes/catalog.js`.

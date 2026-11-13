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
| S1 catalog | **Done** | Partner | Verified live in Docker: 240 flights, 49 hotels, Menon range, R1 422. Browser "Done when" needs frontend. |
| S2 requests | **Done** | Partner | Verified live: Menon REQ-1001 → 2 suppliers; ₹9,000 → 422 R3; 7 adults → 0 + reason; survives restart. |
| S3 dashboard | **Done** | Partner | Verified live: Sakura sees REQ-1001 with [SC-3]; per-car verdicts; Narita list empty, detail 403 R4. |
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

### S1 — flights, hotels, price range (not yet committed)
- `GET /api/flights` — 240 flights landing at ARRIVAL_AIRPORTS, sorted by `arrival_at, flight_id`;
  shape `{ flightId, airline, flightNumber, from, to, arrivalLocal }`.
- `GET /api/hotels` — 49, sorted by city, area, name; shape `{ hotelId, name, city, area }`.
- `GET /api/price-range?flightId&hotelId` — contract JSON; 400 missing param; 404 unknown flight/hotel;
  422 R1 (`field: hotelId`) "NRT does not serve Osaka. It serves: Tokyo."
- `rules/requestRules.js` → `checkAirportServesCity(airport{code, servesCities}, hotel)`: returns violation or null.
  Airport with no cities → R1 on `flightId`: "DEL is not an arrival airport for this service (NRT, HND, KIX, DXB, AUH)."
- `services/catalog.js` → `resolveTrip(flightId, hotelId, db?)` returns `{ flight, hotel, airport, route, violation }`
  — **reuse this in S2** for request validation.
- `repos/catalog.js` → `getFlight`, `getHotel`, `getAirport` (servesCities sorted A–Z), `getRoute`; each takes an
  optional `db` (a transaction client).
- Tests: `test/rules/requestRules.test.js`, `test/api/s1-catalog.test.js`.

### S2 — post the request (not yet committed)
- `rules/hours.js` — `isOpenAt(from, until, hhmm)`, inclusive, midnight crossing.
- `rules/intervals.js` — `overlaps(aStart, aEnd, bStart, bEnd)`, half-open.
- `rules/requestRules.js` — `inr(n)` (₹10,200), `earliestPickup(flight)`, `checkPickup` (R2), `checkPrice` (R3),
  `validateRequest(input, flight, hotel, airport, route)` → all violations in order R1 (exists, airport/city, route,
  adults, childAges, largeBags, smallBags) → R2 → R3. Unknown flight/hotel on POST is **422 R1** (404 only on price-range).
- `rules/eligibility.js` — `checkFit` (R5), `findClash` / `busyViolation` (R6), `checkVehicle` (R5+R6),
  `worksAtAirport` / `drivesToArea` / `openAtPickup` (R4), `evaluateSupplier(request, company, vehicles, busyTimes)`,
  `canServe`, `summarize(request, companies, busyTimes)` → `{ supplierCount, reason }`.
  Eligibility functions take the **API request object** (uses `flight.to`, `hotel.city/area`, `pickupAt`, `busyUntil`,
  `passengers`, bags, `carType`).
  Messages: "Needs 3 large-bag spaces, SC-1 has 2." / "SC-2 is busy 10 Apr 11:00 – 14:00." /
  "Traveler asked for SUV, EP-1 is a SEDAN." / reason sentences per stage (airport → area → open → fits → free).
- `repos/companies.js` — `loadCompanies()`, `getCompany(id)` (company objects with airports, areas, vehicles in
  camelCase), `listBusyTimes(vehicleIds?)` → `[{ vehicleId, startAt, endAt, source, rideId, bookingNumber }]`.
- `repos/requests.js` — `getRequest`, `listRequests({traveler, status})` (newest first), `insertRequest`
  (id `REQ-` + `ride_request_seq`), `findIdByIdempotencyKey`. Rows include `offer_count`, `booking_number`.
- `services/requests.js` — zod `requestBody` (shape → 400), `toRequestObject(row)` (**reuse in every later slice**),
  `createRequest(body, key)` → `{status 201|200, body}`, `getRequestView`, `listRequestViews`.
  Idempotency: existing key → 200 same body; concurrent duplicate caught via 23505 on `ride_requests_idempotency_key_key`.
- `routes/requests.js` — `POST /api/requests`, `GET /api/requests?traveler=`, `GET /api/requests/:requestId`.
- Tests: `test/rules/validateRequest.test.js`, `test/rules/eligibility.test.js`, `test/api/s2-requests.test.js`.

### S3 — supplier dashboard (not yet committed)
- `rules/eligibility.js` → added `r4Violations(request, company)`: "X does not work at NRT." (field airport) /
  "X does not drive to Tokyo / Ueno." (area) / "X is closed at 22:30 (open 07:00–22:00)." (pickupAt).
- `repos/offers.js` → `toOffer(row)`, `listCompanyOffers(companyId, requestIds?)` (oldest first).
- `services/dashboard.js` → `requireCompany(id)` (404), `listForSupplier(companyId)` (OPEN only, R4 ok and ≥1 car ok,
  sorted by pickup then id; `fittingFreeVehicles` in car file order; `myOffers` from offers table),
  `detailForSupplier(companyId, requestId)` (404s; 403 FORBIDDEN with R4 violations, no details; otherwise every car
  with `ok` + `violations`, plus `myOffers`).
- `routes/dashboard.js` → `GET /api/suppliers/:companyId/requests`, `GET /api/suppliers/:companyId/requests/:requestId`.
- Tests: `test/api/s3-dashboard.test.js` (14).

Test count: **75 passing**.

## Implementation decisions (beyond the build plan)

- Timestamps are parsed in `db.js` straight to `"YYYY-MM-DDTHH:MM"` (not the raw PG `"YYYY-MM-DD HH:MM:SS"`),
  so every layer sees the API format.
- `isLocalDateTime` accepts an optional `:SS`; anything with `Z` or an offset is refused.
- Rule message dates use `pretty()` → "10 Apr 11:00".
- `created_at` columns use UTC wall-clock (`now() AT TIME ZONE 'UTC'`); offers/changes use `clock_timestamp()`
  so two inserts in one transaction still order by creation time.
- Supplier list order = order in `taxi_companies.json` (so TX-JP-01 is first, as the plan's test expects).
- Seed requests are loaded as-is (not re-validated against R1–R3).
- Serveability is computed live on every read (busy times change). For a BOOKED request it is
  `{ supplierCount: null, reason: null }`.
- Seed REQ-0002 (KIX → Osaka / Namba, SEDAN) has 0 suppliers by the data: Kansai Airport Taxi has no SEDAN.
- Supplier dashboard is sorted by pickup time (earliest first); the plan does not say.
- Detail page: 403 only for R4. A supplier that passes R4 sees the detail even when no car fits or is free
  (it shows why per car); the list hides such requests.
- The live `taxi` DB has test requests REQ-1001/1002 from the S2 check; run `docker compose down -v` before the demo.

## Next up — S4 backend (assign a car, R7)

1. Tests first (plan §7 Slice 4 list): SC-3 @12500 → 201; SC-2 → 422 R6; SC-1 @17000 → 422 R5 + R3;
   10200/16800 ok, 10199 → R3; EP-2 by Sakura → 403; Narita NS-2 → 422 R4; SC-3 twice → 409; Edo EP-1 + EP-2 → two
   offers (G1); carType SUV + EP-1 → 422 R5 (G2). Plus `GET /api/suppliers/:companyId/offers`.
2. `rules/offerRules.js` → `validateOffer(...)` reusing `r4Violations`, `checkVehicle`, `checkPrice`.
   `services/offers.js` (ownership 403, request OPEN 409, unique `offers_request_vehicle_uniq` → 409), `routes/offers.js`.

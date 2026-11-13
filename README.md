# Airport Taxi Ride Offers

A traveler posts a taxi request for an arrival flight and a hotel. Taxi suppliers see the requests they can serve
and offer one of their cars at a price. The traveler compares the taxis, rejects or books one, gets a 10-digit
booking number, and can later ask to change the flight or pickup time. The supplier accepts or rejects the change.

## Run it

```bash
docker compose up --build
```

Then open **http://localhost:8080**. The API is also reachable directly on http://localhost:4000/api.

| Task | Command |
| --- | --- |
| Reset to a fresh database (data reloads from `data/` on start) | `docker compose down -v` |
| Restart only the API (state is kept) | `docker compose restart api` |
| Backend tests (needs the `db` container) | `docker compose up -d db`, then `cd backend && npm install && npm test` |
| Backend with hot reload | `docker compose up -d db`, then `cd backend && npm run dev` |

## Architecture

```
browser ──► web (nginx :8080, React build) ──/api──► api (Node 20 + Express :4000) ──► db (PostgreSQL 16)
                                                         ▲
                                              data/ (read-only JSON, loaded at boot)
```

- **web**: React 18 + Vite, served by nginx, which proxies `/api` to the API.
- **api**: Express. On every boot it runs `backend/src/schema.sql` (idempotent), then `backend/src/loader.js`, which
  upserts the reference data from `data/` and inserts the 6 seed busy times and 3 seed requests once.
- **db**: PostgreSQL 16 with `btree_gist`. A named volume keeps all state across restarts.

Backend layers (`backend/src/`):

| Folder | Holds |
| --- | --- |
| `rules/` | The rule engine. Pure functions, no database: `requestRules` (R1–R3), `hours` (R4 hours), `intervals` (R6 overlap), `eligibility` (R4–R6, who can serve), `offerRules` (R3–R7), `changeRules` (R1, R2, R9) |
| `services/` | One file per feature; owns transactions and locks |
| `repos/` | SQL only |
| `routes/` | HTTP only |

Tables: reference data `airports`, `airport_cities`, `flights`, `hotels`, `routes`, `companies`,
`company_airports`, `company_areas`, `vehicles`; app data `ride_requests`, `offers`, `bookings`,
`vehicle_busy_times`, `change_requests`.

### No double booking (M6)

Booking runs in one transaction: lock the request, then the offer, then the car row; check the car's busy times;
insert the booking and its busy time; mark the offer BOOKED and the other offers NOT_CHOSEN. The database adds a last
guard: `vehicle_busy_no_overlap`, an exclusion constraint on `(vehicle_id, tsrange(start_at, end_at, '[)'))`, so two
overlapping busy times of one car can never both be stored. Tests fire parallel bookings of the same car and expect
exactly one success.

## What is finished

| Item | Status |
| --- | --- |
| M1 Post a request with flight, hotel, party, bags, pickup, car type, price; suggested price range | Done |
| M2 Supplier dashboard shows only requests it can serve; traveler sees how many suppliers can serve, or why none can | Done |
| M3 Supplier assigns one of its own cars at a price | Done |
| M4 Traveler sees the taxis, rejects or books one | Done |
| M5 Booking summary by 10-digit booking number | Done |
| M6 No double booking of a car | Done (transaction + row locks + exclusion constraint) |
| M7 Change request (new flight and/or pickup); supplier accepts or rejects | Done |
| G1 Several cars per supplier on one request | Done |
| G2 Car type choice | Done |
| G5 Sort and filter the taxi list | Done |

Every refusal names its rule (R1–R9) and the numbers involved, e.g.
`R3: Price ₹9,000 is below the minimum ₹10,200 (range ₹10,200 – ₹16,800).`

## Rules and decisions

| Rule | Decision |
| --- | --- |
| R1 | Flight and hotel exist; the arrival airport serves the hotel's city; adults ≥ 1; child ages 0–17; bags ≥ 0 |
| R2 | Pickup ≥ landing + 60 min (`MIN_PICKUP_GAP_MIN`). No pickup given → landing + 60 |
| R3 | Price inside the route's range; both ends allowed |
| R4 | Supplier works at the airport, drives to the hotel's city/area, and is open at the pickup time (both ends included; a window like 05:00–01:00 crosses midnight). Checked at the pickup moment only |
| R5 | Seats ≥ passengers; large and small bags checked separately; car type must match when one is requested |
| R6 | A car is busy from pickup to pickup + 2 × drive minutes (`BUSY_DRIVE_FACTOR`). A time that starts exactly at another's end does not overlap |
| R7 | A supplier can only assign its own car |
| R9 | A change keeps the same arrival airport; a flight-only change sets pickup to the new landing + 60; one pending change per booking; something must change |
| Offers | An offer does not make a car busy; only a booking does. One car can be offered once per request |
| Accept a change | Re-checks R2 and that the car is free at the new time (ignoring the booking's own old slot). If the car is busy, the change is saved as REJECTED by SYSTEM with the reason, and the booking stays |
| Booking number | Random, 10 digits, first digit 1–9; spaces and dashes are ignored on lookup |
| Request ids | Seeds keep `REQ-0001`…`REQ-0003`; app requests start at `REQ-1001` |
| Times | Local strings `2027-04-10T11:30` everywhere; a value ending in `Z` or an offset is refused (400) |

Constants live in `backend/src/config.js`.

## API errors

Every non-2xx response is `{ code, message, violations: [{ rule, field, message }] }`.

| HTTP | code | When |
| --- | --- | --- |
| 400 | `VALIDATION` | Wrong shape (missing field, not a whole number, bad date format) |
| 403 | `FORBIDDEN` | Supplier acts on another supplier's car or booking, or opens a request it cannot serve (R4) |
| 404 | `NOT_FOUND` | Unknown id or booking number |
| 409 | `CONFLICT` | Wrong state (already booked, offer rejected, change not pending) or car became busy (R6) |
| 422 | `RULE_VIOLATION` | Well-formed but breaks R1–R9; lists every broken rule |

## Known limitations

- No login: the persona picker sets traveler or supplier in the URL.
- Offers do not hold a car; a car can be offered on overlapping requests, and only the first booking wins.
- A change request must keep the same arrival airport; opening hours (R4) are not re-checked on accept.
- No cancellation of bookings.
- No arrival flight in the data lands late enough for landing + 60 to pass midnight (latest is 22:50); the
  next-day pickup is covered by rule tests, and busy times crossing midnight by API tests.

## Tests

Backend: Vitest + supertest, 155 tests. Rule tests are pure; API tests run against a separate `taxi_test` database
with the real data, including judge-style cases at every airport, the seed busy times, midnight windows, parallel
bookings and restart.

```bash
docker compose up -d db
cd backend
npm install
npm test
```

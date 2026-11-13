-- Runs at every boot before the loader. Every statement is idempotent.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Reference tables: mirror data/ (read-only files, loaded by loader.js)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS airports (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  city        text NOT NULL,
  country     text NOT NULL,
  timezone    text NOT NULL,
  lat         numeric,
  lng         numeric
);

-- airports.serves_cities, one row per city (R1)
CREATE TABLE IF NOT EXISTS airport_cities (
  airport_code  text NOT NULL REFERENCES airports(code),
  city          text NOT NULL,
  PRIMARY KEY (airport_code, city)
);

CREATE TABLE IF NOT EXISTS flights (
  flight_id        text PRIMARY KEY,
  airline          text NOT NULL,
  flight_number    text NOT NULL,
  from_airport     text NOT NULL REFERENCES airports(code),
  to_airport       text NOT NULL REFERENCES airports(code),
  departure_local     timestamp NOT NULL,
  arrival_local       timestamp NOT NULL,
  stops            int NOT NULL DEFAULT 0,
  duration_minutes int,
  cabin            text
);
CREATE INDEX IF NOT EXISTS flights_to_arrival_idx ON flights (to_airport, arrival_local);

CREATE TABLE IF NOT EXISTS hotels (
  hotel_id    text PRIMARY KEY,
  name        text NOT NULL,
  city        text NOT NULL,
  area        text NOT NULL,
  stars       int,
  rating      numeric
);

CREATE TABLE IF NOT EXISTS routes (
  airport        text NOT NULL REFERENCES airports(code),
  city           text NOT NULL,
  area           text NOT NULL,
  distance_km    numeric NOT NULL,
  drive_minutes  int NOT NULL CHECK (drive_minutes > 0),
  price_min_inr  int NOT NULL,
  price_max_inr  int NOT NULL,
  PRIMARY KEY (airport, city, area),
  CONSTRAINT routes_price_order CHECK (price_min_inr <= price_max_inr)
);

CREATE TABLE IF NOT EXISTS companies (
  company_id     text PRIMARY KEY,
  name           text NOT NULL,
  service_from   time NOT NULL,   -- local time of the airport; both ends included (R4)
  service_until  time NOT NULL,   -- from > until means the window crosses midnight
  rating         numeric,
  sort_order     int NOT NULL   -- position in taxi_companies.json
);

CREATE TABLE IF NOT EXISTS company_airports (
  company_id    text NOT NULL REFERENCES companies(company_id),
  airport_code  text NOT NULL REFERENCES airports(code),
  sort_order    int  NOT NULL DEFAULT 0,   -- position in the company's "airports" list
  PRIMARY KEY (company_id, airport_code)
);

CREATE TABLE IF NOT EXISTS company_areas (
  company_id  text NOT NULL REFERENCES companies(company_id),
  city        text NOT NULL,
  area        text NOT NULL,
  PRIMARY KEY (company_id, city, area)
);

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id  text PRIMARY KEY,
  company_id  text NOT NULL REFERENCES companies(company_id),
  type        text NOT NULL CHECK (type IN ('HATCHBACK','SEDAN','SUV','BUS')),
  seats       int NOT NULL CHECK (seats > 0),
  large_bags  int NOT NULL CHECK (large_bags >= 0),
  small_bags  int NOT NULL CHECK (small_bags >= 0),
  sort_order  int NOT NULL
);
CREATE INDEX IF NOT EXISTS vehicles_company_idx ON vehicles (company_id);

-- ---------------------------------------------------------------------------
-- App tables: data the app creates (survives restarts)
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS ride_request_seq START 1001;

CREATE TABLE IF NOT EXISTS ride_requests (
  request_id       text PRIMARY KEY,
  source           text NOT NULL CHECK (source IN ('SEED','APP')),
  idempotency_key  text UNIQUE,
  traveler_name    text NOT NULL,
  flight_id        text NOT NULL REFERENCES flights(flight_id),
  hotel_id         text NOT NULL REFERENCES hotels(hotel_id),
  airport          text NOT NULL,
  city             text NOT NULL,
  area             text NOT NULL,
  drive_minutes    int  NOT NULL,
  adults           int  NOT NULL,
  child_ages       int[] NOT NULL DEFAULT '{}',
  large_bags       int  NOT NULL,
  small_bags       int  NOT NULL,
  pickup_at        timestamp NOT NULL,
  car_type         text,
  price_inr        int  NOT NULL,
  status           text NOT NULL DEFAULT 'OPEN',
  created_at       timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  CONSTRAINT rr_adults_min      CHECK (adults >= 1),
  CONSTRAINT rr_child_age_range CHECK (0 <= ALL (child_ages) AND 17 >= ALL (child_ages)),
  CONSTRAINT rr_bags_nonneg     CHECK (large_bags >= 0 AND small_bags >= 0),
  CONSTRAINT rr_status_valid    CHECK (status IN ('OPEN','BOOKED')),
  CONSTRAINT rr_car_type_valid  CHECK (car_type IS NULL OR car_type IN ('HATCHBACK','SEDAN','SUV','BUS')),
  CONSTRAINT rr_route_fk        FOREIGN KEY (airport, city, area) REFERENCES routes(airport, city, area)
);
CREATE INDEX IF NOT EXISTS ride_requests_status_idx ON ride_requests (status);

CREATE TABLE IF NOT EXISTS offers (
  offer_id    bigserial PRIMARY KEY,
  request_id  text NOT NULL REFERENCES ride_requests(request_id),
  company_id  text NOT NULL REFERENCES companies(company_id),
  vehicle_id  text NOT NULL REFERENCES vehicles(vehicle_id),
  price_inr   int  NOT NULL,
  status      text NOT NULL DEFAULT 'OFFERED',
  created_at  timestamp NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  decided_at  timestamp,
  CONSTRAINT offers_status_valid CHECK (status IN ('OFFERED','BOOKED','REJECTED','NOT_CHOSEN')),
  CONSTRAINT offers_request_vehicle_uniq UNIQUE (request_id, vehicle_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS offers_one_booked_per_request
  ON offers (request_id) WHERE status = 'BOOKED';
CREATE INDEX IF NOT EXISTS offers_company_idx ON offers (company_id);

CREATE TABLE IF NOT EXISTS bookings (
  booking_number  char(10) PRIMARY KEY,
  request_id      text NOT NULL UNIQUE REFERENCES ride_requests(request_id),
  offer_id        bigint NOT NULL UNIQUE REFERENCES offers(offer_id),
  company_id      text NOT NULL REFERENCES companies(company_id),
  vehicle_id      text NOT NULL REFERENCES vehicles(vehicle_id),
  flight_id       text NOT NULL REFERENCES flights(flight_id),
  pickup_at       timestamp NOT NULL,
  price_inr       int NOT NULL,
  status          text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED')),
  created_at      timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
  CONSTRAINT bookings_number_format CHECK (booking_number ~ '^[1-9][0-9]{9}$')
);

CREATE TABLE IF NOT EXISTS vehicle_busy_times (
  busy_id         bigserial PRIMARY KEY,
  vehicle_id      text NOT NULL REFERENCES vehicles(vehicle_id),
  start_at        timestamp NOT NULL,
  end_at          timestamp NOT NULL,
  source          text NOT NULL CHECK (source IN ('SEED','BOOKING')),
  ride_id         text UNIQUE,
  booking_number  char(10) UNIQUE REFERENCES bookings(booking_number),
  CONSTRAINT vehicle_busy_order CHECK (end_at > start_at),
  CONSTRAINT vehicle_busy_no_overlap EXCLUDE USING gist (
    vehicle_id WITH =,
    tsrange(start_at, end_at, '[)') WITH &&
  )
);

CREATE TABLE IF NOT EXISTS change_requests (
  change_id       bigserial PRIMARY KEY,
  booking_number  char(10) NOT NULL REFERENCES bookings(booking_number),
  old_flight_id   text NOT NULL REFERENCES flights(flight_id),
  old_pickup_at   timestamp NOT NULL,
  new_flight_id   text NOT NULL REFERENCES flights(flight_id),
  new_pickup_at   timestamp NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  reason          text,
  decided_by      text CHECK (decided_by IS NULL OR decided_by IN ('SUPPLIER','SYSTEM')),
  created_at      timestamp NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  decided_at      timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS cr_one_pending_per_booking
  ON change_requests (booking_number) WHERE status = 'PENDING';

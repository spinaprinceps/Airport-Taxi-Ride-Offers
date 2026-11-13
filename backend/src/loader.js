// Reads data/ (read-only) and fills the database. Runs at every boot after the schema.
// Reference data is upserted; seed busy times and seed requests are inserted once
// (ON CONFLICT DO NOTHING), so app changes to them (e.g. a booked seed request) survive restarts.
// A seed row that points to an unknown car, flight, hotel or route is skipped and logged.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { withTransaction } from './db.js';

async function readJson(dataDir, ...parts) {
  return JSON.parse(await readFile(path.join(dataDir, ...parts), 'utf8'));
}

// "2027-04-10T10:30:00" -> "2027-04-10T10:30"
const local = (s) => s.slice(0, 16);

export async function loadData(dataDir = DATA_DIR, log = console) {
  const [airports, flights, hotels, routes, companies, rides, requests] = await Promise.all([
    readJson(dataDir, 'catalog', 'airports.json'),
    readJson(dataDir, 'catalog', 'flights.json'),
    readJson(dataDir, 'catalog', 'hotels.json'),
    readJson(dataDir, 'problem-2', 'routes.json'),
    readJson(dataDir, 'problem-2', 'taxi_companies.json'),
    readJson(dataDir, 'problem-2', 'booked_rides.json'),
    readJson(dataDir, 'problem-2', 'open_requests.json'),
  ]);

  const airportCities = airports.flatMap((a) => (a.serves_cities ?? []).map((city) => ({ airport: a.code, city })));
  const companyRows = companies.map((c, i) => ({ ...c, sort_order: i }));
  const companyAirports = companies.flatMap((c) =>
    c.airports.map((airport, i) => ({ company_id: c.company_id, airport, sort_order: i })),
  );
  const companyAreas = companies.flatMap((c) => c.areas.map((a) => ({ company_id: c.company_id, city: a.city, area: a.area })));
  const vehicles = companies.flatMap((c) =>
    c.vehicles.map((v, i) => ({ ...v, company_id: c.company_id, sort_order: i })),
  );
  const flightRows = flights.map((f) => ({
    ...f,
    departure_local: local(f.departure_local),
    arrival_local: local(f.arrival_local),
  }));

  // Seed rows: check their links before inserting.
  const vehicleIds = new Set(vehicles.map((v) => v.vehicle_id));
  const flightById = new Map(flights.map((f) => [f.flight_id, f]));
  const hotelById = new Map(hotels.map((h) => [h.hotel_id, h]));
  const routeByKey = new Map(routes.map((r) => [`${r.airport}|${r.city}|${r.area}`, r]));
  const skipped = [];

  const busyRows = rides.filter((r) => {
    if (vehicleIds.has(r.vehicle_id)) return true;
    skipped.push(`booked ride ${r.ride_id}: unknown vehicle ${r.vehicle_id}`);
    return false;
  }).map((r) => ({ ...r, start: local(r.start), end: local(r.end) }));

  const requestRows = [];
  for (const r of requests) {
    const flight = flightById.get(r.flight_id);
    const hotel = hotelById.get(r.hotel_id);
    if (!flight) { skipped.push(`open request ${r.request_id}: unknown flight ${r.flight_id}`); continue; }
    if (!hotel) { skipped.push(`open request ${r.request_id}: unknown hotel ${r.hotel_id}`); continue; }
    const route = routeByKey.get(`${flight.to}|${hotel.city}|${hotel.area}`);
    if (!route) { skipped.push(`open request ${r.request_id}: no route ${flight.to} -> ${hotel.city} / ${hotel.area}`); continue; }
    requestRows.push({
      ...r,
      pickup: local(r.pickup),
      airport: flight.to,
      city: hotel.city,
      area: hotel.area,
      drive_minutes: route.drive_minutes,
    });
  }

  const json = (rows) => JSON.stringify(rows);

  await withTransaction(async (db) => {
    await db.query(
      `INSERT INTO airports (code, name, city, country, timezone, lat, lng)
       SELECT code, name, city, country, timezone, lat, lng
         FROM jsonb_to_recordset($1::jsonb)
           AS x(code text, name text, city text, country text, timezone text, lat numeric, lng numeric)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city,
         country = EXCLUDED.country, timezone = EXCLUDED.timezone, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
      [json(airports)],
    );
    await db.query(
      `INSERT INTO airport_cities (airport_code, city)
       SELECT airport, city FROM jsonb_to_recordset($1::jsonb) AS x(airport text, city text)
       ON CONFLICT DO NOTHING`,
      [json(airportCities)],
    );
    await db.query(
      `INSERT INTO flights (flight_id, airline, flight_number, from_airport, to_airport,
                            departure_local, arrival_local, stops, duration_minutes, cabin)
       SELECT flight_id, airline, flight_number, "from", "to", departure_local, arrival_local, stops, duration_minutes, cabin
         FROM jsonb_to_recordset($1::jsonb)
           AS x(flight_id text, airline text, flight_number text, "from" text, "to" text,
                departure_local timestamp, arrival_local timestamp, stops int, duration_minutes int, cabin text)
       ON CONFLICT (flight_id) DO UPDATE SET airline = EXCLUDED.airline, flight_number = EXCLUDED.flight_number,
         from_airport = EXCLUDED.from_airport, to_airport = EXCLUDED.to_airport,
         departure_local = EXCLUDED.departure_local, arrival_local = EXCLUDED.arrival_local,
         stops = EXCLUDED.stops, duration_minutes = EXCLUDED.duration_minutes, cabin = EXCLUDED.cabin`,
      [json(flightRows)],
    );
    await db.query(
      `INSERT INTO hotels (hotel_id, name, city, area, stars, rating)
       SELECT hotel_id, name, city, area, stars, rating
         FROM jsonb_to_recordset($1::jsonb)
           AS x(hotel_id text, name text, city text, area text, stars int, rating numeric)
       ON CONFLICT (hotel_id) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city,
         area = EXCLUDED.area, stars = EXCLUDED.stars, rating = EXCLUDED.rating`,
      [json(hotels)],
    );
    await db.query(
      `INSERT INTO routes (airport, city, area, distance_km, drive_minutes, price_min_inr, price_max_inr)
       SELECT airport, city, area, distance_km, drive_minutes, price_min_inr, price_max_inr
         FROM jsonb_to_recordset($1::jsonb)
           AS x(airport text, city text, area text, distance_km numeric, drive_minutes int,
                price_min_inr int, price_max_inr int)
       ON CONFLICT (airport, city, area) DO UPDATE SET distance_km = EXCLUDED.distance_km,
         drive_minutes = EXCLUDED.drive_minutes, price_min_inr = EXCLUDED.price_min_inr,
         price_max_inr = EXCLUDED.price_max_inr`,
      [json(routes)],
    );
    await db.query(
      `INSERT INTO companies (company_id, name, service_from, service_until, rating, sort_order)
       SELECT company_id, name, service_from, service_until, rating, sort_order
         FROM jsonb_to_recordset($1::jsonb)
           AS x(company_id text, name text, service_from time, service_until time, rating numeric, sort_order int)
       ON CONFLICT (company_id) DO UPDATE SET name = EXCLUDED.name, service_from = EXCLUDED.service_from,
         service_until = EXCLUDED.service_until, rating = EXCLUDED.rating, sort_order = EXCLUDED.sort_order`,
      [json(companyRows)],
    );
    await db.query(
      `INSERT INTO company_airports (company_id, airport_code, sort_order)
       SELECT company_id, airport, sort_order
         FROM jsonb_to_recordset($1::jsonb) AS x(company_id text, airport text, sort_order int)
       ON CONFLICT (company_id, airport_code) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [json(companyAirports)],
    );
    await db.query(
      `INSERT INTO company_areas (company_id, city, area)
       SELECT company_id, city, area FROM jsonb_to_recordset($1::jsonb) AS x(company_id text, city text, area text)
       ON CONFLICT DO NOTHING`,
      [json(companyAreas)],
    );
    await db.query(
      `INSERT INTO vehicles (vehicle_id, company_id, type, seats, large_bags, small_bags, sort_order)
       SELECT vehicle_id, company_id, type, seats, large_bags, small_bags, sort_order
         FROM jsonb_to_recordset($1::jsonb)
           AS x(vehicle_id text, company_id text, type text, seats int, large_bags int, small_bags int, sort_order int)
       ON CONFLICT (vehicle_id) DO UPDATE SET company_id = EXCLUDED.company_id, type = EXCLUDED.type,
         seats = EXCLUDED.seats, large_bags = EXCLUDED.large_bags, small_bags = EXCLUDED.small_bags,
         sort_order = EXCLUDED.sort_order`,
      [json(vehicles)],
    );
    await db.query(
      `INSERT INTO vehicle_busy_times (vehicle_id, start_at, end_at, source, ride_id)
       SELECT vehicle_id, start, "end", 'SEED', ride_id
         FROM jsonb_to_recordset($1::jsonb)
           AS x(ride_id text, vehicle_id text, start timestamp, "end" timestamp)
       ON CONFLICT (ride_id) DO NOTHING`,
      [json(busyRows)],
    );
    await db.query(
      `INSERT INTO ride_requests (request_id, source, traveler_name, flight_id, hotel_id, airport, city, area,
                                  drive_minutes, adults, child_ages, large_bags, small_bags, pickup_at,
                                  car_type, price_inr, status)
       SELECT request_id, 'SEED', traveler_name, flight_id, hotel_id, airport, city, area,
              drive_minutes, adults, ARRAY(SELECT jsonb_array_elements_text(child_ages)::int),
              large_bags, small_bags, pickup, car_type, price_inr, 'OPEN'
         FROM jsonb_to_recordset($1::jsonb)
           AS x(request_id text, traveler_name text, flight_id text, hotel_id text, airport text, city text,
                area text, drive_minutes int, adults int, child_ages jsonb, large_bags int, small_bags int,
                pickup timestamp, car_type text, price_inr int)
       ON CONFLICT (request_id) DO NOTHING`,
      [json(requestRows)],
    );
  });

  for (const s of skipped) log.warn(`[loader] skipped ${s}`);
  return { skipped };
}
